# ======================================================================
# ENCA self-hosting image (R06) — nginx over the static files.
#
# The app is static files and a browser: no server-side code, no database,
# nothing stored. This image is nothing more than nginx serving the repo,
# which is the whole point — what you run is what you can read.
#
# Build:  docker build -t enca .
# Run:    docker run -d --name enca -p 8080:80 enca
# Or use the published image: ghcr.io/nurejev/enca:latest  (:beta for the
# beta channel) — see SELF-HOSTING.md, and read the redirect-URI section
# there FIRST: it is the one step that cannot be automated and the one
# that produces the confusing sign-in error when missed.
# ======================================================================
FROM nginx:1.27-alpine

# Our own server config: security headers, sane caching, gzip.
COPY selfhost/nginx.conf /etc/nginx/conf.d/default.conf

# The site itself. .dockerignore keeps .git, _to_delete and the deploy
# scaffolding out of the image.
COPY . /usr/share/nginx/html/

# The CNAME file belongs to GitHub Pages on the canonical host, not to a
# self-hosted copy.
RUN rm -f /usr/share/nginx/html/CNAME
