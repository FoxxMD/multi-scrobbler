# Production runtime is Google distroless (no shell, no package manager, non-root)
# https://github.com/GoogleContainerTools/distroless
#
# Targets:
#   app       (default) production image
#   app-debug production image + busybox shell + static curl, for troubleshooting
#
# Base images are pinned by digest. Keep the builder's Node major and Debian release
# in sync with the distroless runtime so native addons (sharp, classic-level) match.

#
#
#
FROM node:24-trixie-slim@sha256:0820eaa85e07d0490446dd01d14707e17e6108a36988cf374899cd057eb3812d AS builder
#
#
#

RUN echo "Node: $(node -v)\nNPM: $(npm -v)"

RUN npm install -g concurrently

# empty, so the runtime image can ship a /config owned by the default user
RUN mkdir /config

#
#
#
FROM builder AS app-src
#
#
#

# dev dependencies and source, shared by the test and app-build stages

WORKDIR /app

COPY package*.json tsconfig.json ./
COPY patches ./patches
COPY docsite/patches ./docsite/patches
COPY docsite/package*.json docsite/tsconfig* ./docsite/

# for debugging, so the build fails faster when timing out (arm64)
#RUN npm config set fetch-retries 1 && \
#    npm config set fetch-retry-mintimeout 5000 && \
#    npm config set fetch-retry-maxtimeout 5000

# This FAILED for node < 20 when building arm64 but not amd64 (and alpine-based Dockerfile has no issues building arm64)
# see https://github.com/FoxxMD/multi-scrobbler/issues/126
RUN npm run install:parallel

COPY . /app

#
#
#
FROM app-src AS test
#
#
#

# Runs the test suite as part of the image build, used by CI with `--target test`.
# Not a dependency of the app target so a normal build skips it.
RUN npm run test

#
#
#
FROM app-src AS app-build
#
#
#

# need to set before build so server/client build is optimized and has constants (if needed)
ENV NODE_ENV=production

# Optional, only affects the self-hosted docs site (/docs)
#
# Astro bakes its base path in at build time, unlike the main app frontend, which resolves
# its own base path at container runtime and needs nothing set here. Pass the
# same value here and as the runtime BASE_URL env var, e.g.
# --build-arg BASE_URL=http://example.com/myapp, to keep docs working under a subpath.
ARG BASE_URL=""
ENV BASE_URL=$BASE_URL

# Optional, include the docs' release notes pages (fetched from the GitHub API at build time)
ARG DOCS_CHANGELOGS=false
ENV DOCS_CHANGELOGS=$DOCS_CHANGELOGS

RUN if [ -n "$BASE_URL" ]; then \
        export DOCS_BASE="$(node -e "console.log(new URL(process.env.BASE_URL).pathname.replace(/\/$/, '') + '/docs')")"; \
    fi; \
    npm run build:parallel && rm -rf node_modules && rm -rf docsite/node_modules

#
#
#
FROM builder AS app-deps
#
#
#

WORKDIR /app

ENV NODE_ENV=production

COPY package*.json tsconfig.json ./
COPY patches ./patches

RUN npm ci --omit=dev --no-audit \
    && npm cache clean --force \
    ## peerDependency of validbot and can(?) be removed for production
    && rm -r node_modules/typescript \
    ## youtubei.js includes a large folder of maps and d.ts files that
    ## are only used for frontend bundling, we we don't need
    && rm -rf node_modules/youtubei.js/bundle \
    && npx @usex/prune-mod -w \
    && rm -rf /root/.cache

#
#
#
FROM gcr.io/distroless/nodejs24-debian13:nonroot@sha256:b8cec4b2f2126ff7bd034ec9ac207ffb3272667dfdc48376e3b035d3270549ba AS app
#
#
#

WORKDIR /app

#
# from project, no build/stages necessary
#
# app files are owned by root and read-only for the running user
#

# project-top-level files
COPY *.json *.js *.ts index.html ./
# backend source files
COPY src/backend /app/src/backend
COPY src/core /app/src/core

#
# from prod install stage
#

# prod dependencies
COPY --from=app-deps /app/node_modules /app/node_modules

#
# from app build stage
#

# frontend build from vite/esbuild
COPY --from=app-build /app/dist /app/dist
# docs build
COPY --from=app-build /app/docsite/build /app/docsite/build

#
# ENV and ARGs for setting defaults in container
#

ENV TZ=Etc/GMT
ENV NODE_ENV=production
ENV IS_DOCKER=true
ENV COLORED_STD=true

# https://stackoverflow.com/a/63640896/1469797
ARG APP_BUILD_VERSION
ENV APP_VERSION=$APP_BUILD_VERSION

ARG BUILD_DATE=0

LABEL org.opencontainers.image.version="$APP_BUILD_VERSION" \
      org.opencontainers.image.source="https://github.com/FoxxMD/multi-scrobbler" \
      org.opencontainers.image.documentation="https://docs.multi-scrobbler.app" \
      org.opencontainers.image.description="Scrobble from multiple sources to multiple clients" \
      org.opencontainers.image.title="Multi-Scrobbler" \
      org.opencontainers.image.licenses="MIT" \
      org.opencontainers.image.authors="FoxxMD" \
      org.opencontainers.image.created="$BUILD_DATE" \
      org.opencontainers.image.url="https://docs.multi-scrobbler.app" \
      maintainer="FoxxMD" \
      build_version="$APP_BUILD_VERSION"

ARG webPort=9078
ENV PORT=$webPort
EXPOSE $PORT

ARG data_dir=/config
# owned by the distroless nonroot user (65532) so a new named/anonymous volume is writable
COPY --from=builder --chown=65532:65532 /config $data_dir
VOLUME $data_dir
ENV CONFIG_DIR=$data_dir
ENV LOGS_DIR=$data_dir/logs
ENV DATA_DIR=$data_dir

# Runs as the distroless nonroot user (65532:65532) by default.
# For a bind-mounted config directory set `user: UID:GID` (compose) or `--user UID:GID`
# to the directory's owner, or chown the directory to 65532:65532.

# ENTRYPOINT is /nodejs/bin/node from the distroless base
# pass extra node flags with NODE_OPTIONS
CMD ["/app/src/backend/index.ts"]

#
#
#
FROM debian:trixie-slim@sha256:a72b4433de1cf7d6bae0c4cee74d0547f58601a643b3375f070c51600d63b6b2 AS curl-dl
#
#
#

# statically linked curl so it runs on distroless without extra shared libraries
# https://github.com/stunnel/static-curl/releases
# checksums are the GitHub release asset digests of the tar.xz files
ARG TARGETARCH
ARG CURL_VERSION=8.22.0
ARG CURL_SHA256_X86_64=dfb02460ba2abe513087538f12a3cf79b74b64a5ea3787ce8ac0cdb11251f884
ARG CURL_SHA256_AARCH64=cf94cbeaae1b3c1944a4a761ef04478f8f0b23e93a324b5ed009b2082eda11f3

RUN apt-get update \
    && apt-get install --no-install-recommends -y curl ca-certificates xz-utils \
    && case "$TARGETARCH" in \
         amd64) ARCH=x86_64 SHA=$CURL_SHA256_X86_64;; \
         arm64) ARCH=aarch64 SHA=$CURL_SHA256_AARCH64;; \
         *) echo "unsupported architecture $TARGETARCH"; exit 1;; \
       esac \
    && curl -fsSL -o /tmp/curl.tar.xz "https://github.com/stunnel/static-curl/releases/download/${CURL_VERSION}/curl-linux-${ARCH}-musl-${CURL_VERSION}.tar.xz" \
    && echo "$SHA  /tmp/curl.tar.xz" | sha256sum -c - \
    && tar -xJf /tmp/curl.tar.xz -C /usr/local/bin curl \
    && /usr/local/bin/curl --version

#
#
#
FROM gcr.io/distroless/nodejs24-debian13:debug-nonroot@sha256:3113adad6d98116a67d4a60b23d227fbafa704208b3b114c4a91470c244c3af1 AS busybox
#
#
#

#
#
#
FROM app AS app-debug
#
#
#

# Only adds layers on top of the finished production image so every app layer is shared.
# Open a shell with: docker exec -it <container> sh

COPY --from=busybox /busybox /busybox
COPY --from=curl-dl /usr/local/bin/curl /usr/local/bin/curl
ENV PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin:/busybox

# default target when no --target is given
FROM app
