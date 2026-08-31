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
# self-hosted copy. The entrypoint has to stay in the build context so the
# COPY below can reach it, which means `COPY .` also drops a copy into the
# web root - remove that one, because nothing served to a browser should be
# a shell script.
RUN rm -f /usr/share/nginx/html/CNAME \
 && rm -f /usr/share/nginx/html/selfhost/docker-entrypoint.sh

# Point the copy at YOUR OWN app registration without forking or rebuilding:
#   -e ENCA_CLIENT_ID=<guid> [-e ENCA_TENANT_ID=<guid>]
# The entrypoint applies them to js/authConfig.js at start and does nothing
# at all when they are unset, so the image is unchanged without them. This is
# what makes the promise hold on Azure Container Apps, where there is no
# filesystem to mount a config file into. See selfhost/docker-entrypoint.sh.
COPY selfhost/docker-entrypoint.sh /docker-entrypoint-enca.sh
RUN chmod +x /docker-entrypoint-enca.sh
ENTRYPOINT ["/docker-entrypoint-enca.sh"]
CMD ["nginx", "-g", "daemon off;"]
