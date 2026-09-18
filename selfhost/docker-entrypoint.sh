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
# ENCA_BRANDING       Your deployment's look, as the JSON the ⚙ gear exports —
#                     raw, or base64 if your platform dislikes braces in an
#                     env var. Written to selfhost-branding.json at the site
#                     root, which is where the app already looks for it, so
#                     EVERY visitor gets it rather than only the browser it
#                     was designed in.
# ENCA_BRANDING_URL   Same thing, fetched once at start. For when the branding
#                     will not fit in an environment variable — an embedded
#                     PNG logo is the usual reason. ENCA_BRANDING wins when
#                     both are set. A fetch that fails WARNS AND CARRIES ON:
#                     branding is cosmetic, and a container that refuses to
#                     serve the tool because a logo was unreachable has turned
#                     a cosmetic problem into an outage.
#
# A branding file MOUNTED into the image still works and still wins over
# nothing — this is the route for platforms with no filesystem to mount into.
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

# The web root. ENCA_ROOT exists so the script can be run against a copy of
# the site in a test (tools/selfhost-brand-boot.test.cjs does exactly that);
# in the image it is never set and the default is the only path that matters.
ROOT="${ENCA_ROOT:-/usr/share/nginx/html}"
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

  # Unlike branding, this one is FATAL on failure and meant to be. Carrying on
  # would leave a container serving the app with whatever registration the
  # image shipped with, while its operator believes it is using theirs - people
  # would sign in and consent to the wrong application. A container that
  # refuses to start is a problem you can see; that one is not.
  if ! cat "$BLOCK" > "$CFG" 2>/dev/null; then
    rm -f "$BLOCK" "$STRIPPED"
    echo "enca: cannot write $CFG (mounted read-only?) - refusing to start." >&2
    echo "enca: continuing would serve the image's built-in registration while you believe your own is in use." >&2
    exit 1
  fi
  rm -f "$BLOCK" "$STRIPPED"

  echo "enca: runtime configuration applied${CLIENT_ID:+ (clientId $CLIENT_ID)}${AUTH_VALUE:+, authority $AUTH_VALUE}."
  echo "enca: REMINDER - this instance's URL must be a SPA redirect URI on that registration, or sign-in fails with AADSTS50011."
fi

# ---------------------------------------------------------------------
# Branding: the deployment's look, for every visitor rather than for one
# browser. The ⚙ gear writes to localStorage, which is per-person and
# per-browser by design; the FILE at the site root is what the app serves to
# everyone, and until now the only way to put it there was a bind mount.
# ---------------------------------------------------------------------
BRAND_JSON="${ENCA_BRANDING:-}"
BRAND_URL="${ENCA_BRANDING_URL:-}"
BRAND_FILE="$ROOT/selfhost-branding.json"

if [ -n "$BRAND_JSON" ] || [ -n "$BRAND_URL" ]; then
  BRAND_TMP="$(mktemp)"
  BRAND_OK=""

  if [ -n "$BRAND_JSON" ]; then
    # Accept base64 as well as raw JSON: some pipelines mangle braces and
    # quotes in environment variables, and telling somebody their branding is
    # invalid when the platform ate it is a bad afternoon. If it does not look
    # like JSON, try decoding it before giving up.
    if printf '%s' "$BRAND_JSON" | head -c 1 | grep -q '{'; then
      printf '%s' "$BRAND_JSON" > "$BRAND_TMP"
    elif printf '%s' "$BRAND_JSON" | base64 -d > "$BRAND_TMP" 2>/dev/null; then
      echo "enca: ENCA_BRANDING decoded from base64."
    else
      echo "enca: ENCA_BRANDING is neither JSON nor base64 - ignoring it." >&2
      : > "$BRAND_TMP"
    fi
  elif [ -n "$BRAND_URL" ]; then
    # One attempt, short timeouts, never fatal. wget is what nginx:alpine has.
    if wget -q -T 10 -t 2 -O "$BRAND_TMP" "$BRAND_URL"; then
      echo "enca: branding fetched from $BRAND_URL."
    else
      echo "enca: could not fetch ENCA_BRANDING_URL ($BRAND_URL) - starting without it." >&2
      : > "$BRAND_TMP"
    fi
  fi

  # Serve it only if it parses. A truncated or half-written file at that path
  # is worse than no file: the app fetches it on every load, and a parse error
  # there is a puzzle nobody would think to look for in an env var.
  if [ -s "$BRAND_TMP" ]; then
    if command -v python3 >/dev/null 2>&1; then
      python3 -c 'import json,sys; json.load(open(sys.argv[1]))' "$BRAND_TMP" 2>/dev/null && BRAND_OK=1
    else
      # No JSON parser in the image: fall back to a shape check rather than
      # trusting it blindly. The app sanitises every field it reads anyway.
      head -c 1 "$BRAND_TMP" | grep -q '{' && tail -c 2 "$BRAND_TMP" | grep -q '}' && BRAND_OK=1
    fi
  fi

  if [ -n "$BRAND_OK" ]; then
    # The write can legitimately fail: mounting ./selfhost-branding.json read-only
    # is the documented file route, and install.sh does exactly that with :ro. A
    # deployment using BOTH must not die over it - the mounted file is already
    # valid branding, so say which one is in force and carry on. Without this
    # guard `set -e` turned a redundant configuration into a container that
    # never starts.
    if cat "$BRAND_TMP" > "$BRAND_FILE" 2>/dev/null; then
      echo "enca: deployment branding written to selfhost-branding.json - every visitor gets it."
    else
      echo "enca: selfhost-branding.json is not writable (mounted read-only?) - keeping the mounted file and ignoring the variable." >&2
    fi
  elif [ -s "$BRAND_TMP" ]; then
    echo "enca: branding did not parse as JSON - leaving the deployment unbranded." >&2
  fi
  rm -f "$BRAND_TMP"
fi

# ---------------------------------------------------------------------
# The FIRST paint (build 25389).
#
# The branding file above is FETCHED by the app, and a fetch cannot finish
# before the page paints: the first visit in a browser therefore painted the
# image's own look and swapped to the deployment's a moment later. On Azure
# Container Apps, with a cold start in front of that fetch, it was long
# enough to read (Dovilo, 18 Sep).
#
# js/selfhost-boot.js runs BLOCKING in <head> and already paints a brand it
# can read synchronously — it just had nothing to read on a first visit,
# because the only synchronous source was this browser's own cache of an
# earlier read. So the deployment's brand is written INTO that file here,
# exactly the way the runtime configuration block is written into
# js/authConfig.js: markers, idempotent, and nothing at all when no branding
# is configured.
#
# The SOURCE is the file the app itself will fetch — whether this script
# just wrote it from ENCA_BRANDING or the operator mounted it — so the two
# paints can never disagree.
#
# It is embedded as a JSON *string* rather than as an object literal. The
# file is executable content served to every visitor, and a string whose
# backslashes and quotes are escaped cannot become code whatever the
# variable held. The app parses it and applies its own guards (colour values
# are charset-checked, images must be data: URIs) exactly as it does for the
# fetched copy.
# ---------------------------------------------------------------------
BOOT="$ROOT/js/selfhost-boot.js"
BOOT_START="// >>> ENCA-RUNTIME-BRAND"
BOOT_END="// <<< ENCA-RUNTIME-BRAND"

if [ -f "$BOOT" ]; then
  # Always drop a block from an earlier start first: a container restarted
  # without branding must not keep painting the old one.
  BOOT_STRIPPED="$(mktemp)"
  awk -v s="$BOOT_START" -v e="$BOOT_END" '
    $0 == s { skip = 1; next }
    $0 == e { skip = 0; next }
    !skip   { print }
  ' "$BOOT" > "$BOOT_STRIPPED"

  BOOT_BRAND=""
  if [ -s "$BRAND_FILE" ]; then
    # Same check as above: parse it when the image has a parser, otherwise
    # look at its shape. Neither is the security boundary — the escaping and
    # the app's own guards are.
    if command -v python3 >/dev/null 2>&1; then
      python3 -c 'import json,sys; json.load(open(sys.argv[1]))' "$BRAND_FILE" 2>/dev/null && BOOT_BRAND=1
    else
      head -c 1 "$BRAND_FILE" | grep -q '{' && tail -c 2 "$BRAND_FILE" | grep -q '}' && BOOT_BRAND=1
    fi
  fi

  if [ -n "$BOOT_BRAND" ]; then
    ESCAPED="$(sed -e 's/\\/\\\\/g' -e 's/"/\\"/g' "$BRAND_FILE" | tr -d '\n\r\t')"
    SIZE="$(printf '%s' "$ESCAPED" | wc -c | tr -d ' ')"
    if [ "$SIZE" -gt 600000 ]; then
      echo "enca: branding is $SIZE bytes - too large for the first paint; the app still fetches it." >&2
      BOOT_BRAND=""
    fi
  fi

  BOOT_NEW="$(mktemp)"
  {
    if [ -n "$BOOT_BRAND" ]; then
      echo "$BOOT_START"
      echo "// Written at container start from the deployment's branding file by"
      echo "// selfhost/docker-entrypoint.sh, so the FIRST paint is branded too."
      echo "// NOT part of the source tree - if you are reading this in a"
      echo "// repository, something copied it out of a running container."
      printf 'window.ENCA_BRAND_BOOT = "%s";\n' "$ESCAPED"
      echo "$BOOT_END"
    fi
    cat "$BOOT_STRIPPED"
  } > "$BOOT_NEW"

  # Never fatal: branding is cosmetic, and a container that refuses to serve
  # the tool because a logo could not be inlined has turned a cosmetic
  # problem into an outage.
  if cat "$BOOT_NEW" > "$BOOT" 2>/dev/null; then
    [ -n "$BOOT_BRAND" ] && echo "enca: branding applied to the first paint (js/selfhost-boot.js)."
  else
    echo "enca: js/selfhost-boot.js is not writable - the first visit in a browser will still flash the default look." >&2
  fi
  rm -f "$BOOT_NEW" "$BOOT_STRIPPED"
fi

exec "$@"
