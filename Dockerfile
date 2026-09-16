FROM ghcr.io/linuxserver/baseimage-debian:bookworm AS base

ENV TZ=Etc/GMT

RUN \
  echo "**** install base packages ****" && \
    apt-get update && \
    apt-get install --no-install-recommends -y \
        avahi-utils \
        curl && \
  echo "**** cleanup ****" && \
    apt-get purge --auto-remove -y perl && \
    apt-get autoclean && \
    apt-get autoremove && \
      rm -rf \
        /config/.cache \
        /root/cache \
        /var/lib/apt/lists/* \
        /var/tmp/* \
        /tmp/*

RUN ln -snf /usr/share/zoneinfo/$TZ /etc/localtime && echo $TZ > /etc/timezone

# required s6 services to start multi-scrobbler in container
COPY docker/root /

#
#
# 
FROM ghcr.io/linuxserver/baseimage-debian:bookworm AS builder
#
#
# 

ENV NODE_VERSION=24.14.0

RUN \
    ARCH= OPENSSL_ARCH= && dpkgArch="$(dpkg --print-architecture)" \
        && case "${dpkgArch##*-}" in \
          amd64) ARCH='x64' OPENSSL_ARCH='linux-x86_64';; \
          ppc64el) ARCH='ppc64le' OPENSSL_ARCH='linux-ppc64le';; \
          s390x) ARCH='s390x' OPENSSL_ARCH='linux*-s390x';; \
          arm64) ARCH='arm64' OPENSSL_ARCH='linux-aarch64';; \
          armhf) ARCH='armv7l' OPENSSL_ARCH='linux-armv4';; \
          i386) ARCH='x86' OPENSSL_ARCH='linux-elf';; \
          *) echo "unsupported architecture"; exit 1 ;; \
        esac && \
        set -ex && \
  echo "**** install build packages ****" && \
    apt-get update && \
    apt-get install --no-install-recommends -y \
        xz-utils && \
  echo "**** Fetch and install node****" && \
    # get node/npm directly from nodejs dist \
    # https://github.com/nodejs/docker-node/blob/main/18/bookworm-slim/Dockerfile#L41
    curl -fsSLO --compressed "https://nodejs.org/dist/v$NODE_VERSION/node-v$NODE_VERSION-linux-$ARCH.tar.xz" && \
    tar -xJf "node-v$NODE_VERSION-linux-$ARCH.tar.xz" -C /usr --strip-components=1 --no-same-owner && \
    rm "node-v$NODE_VERSION-linux-$ARCH.tar.xz" && \
    ln -s /usr/bin/node /usr/bin/nodejs && \
  echo "**** Update npm****" && \
    npm update -g npm
    #
    # can re-enable if we need more OS stuff from this stage later (but we don't for now)
    #
    #npm update -g npm && \
  #echo "**** cleanup ****" && \
    # https://github.com/nodejs/docker-node/blob/main/18/bookworm-slim/Dockerfile#L49
    # Remove unused OpenSSL headers to save ~34MB
    # (does not affect arm64 issue below)
    #
    #find /usr/include/node/openssl/archs -mindepth 1 -maxdepth 1 ! -name "$OPENSSL_ARCH" -exec rm -rf {} \; && \
    #
    # ^^ only needed if we need keep /usr/include/node in later stages
    #
    # apt-get purge --auto-remove -y xz-utils && \
    # apt-get autoclean && \
    # apt-get autoremove && \
    #   rm -rf \
    #     /config/.cache \
    #     /root/cache \
    #     /var/lib/apt/lists/* \
    #     /var/tmp/* \
    #     /tmp/*
    #
    # can re-enable if we need more OS stuff from this stage later (but we don't for now)

RUN echo "Node: $(node -v)\nNPM: $(npm -v)"

RUN npm install -g concurrently

# in the final layer we only need to copy over the node binary from /usr/bin/node to have a working container
# 
# /usr/include/node is only needed (in later layers) if we need to install any packages that build native addons
# like using node-gyp

#
#
# 
FROM builder AS app-build
#
#
#

WORKDIR /app

COPY --chown=abc:abc package*.json tsconfig.json ./
COPY --chown=abc:abc patches ./patches
COPY --chown=abc:abc docsite/patches ./docsite/patches
COPY --chown=abc:abc docsite/package*.json docsite/tsconfig* ./docsite/

# for debugging, so the build fails faster when timing out (arm64)
#RUN npm config set fetch-retries 1 && \
#    npm config set fetch-retry-mintimeout 5000 && \
#    npm config set fetch-retry-maxtimeout 5000

# https://www.npmjs.com/package/tls-test
# used to test that the OS supports downloading packages over HTTPS with TLS 1.2 enforced
# -- this always succeeds but a good sanity check
#RUN npm install -g https://tls-test.npmjs.com/tls-test-1.0.0.tgz

# This FAILED for node < 20 when building arm64 but not amd64 (and alpine-based Dockerfile has no issues building arm64)
# see https://github.com/FoxxMD/multi-scrobbler/issues/126
RUN npm run install:parallel \
    && chown -R root:root node_modules \
    && chown -R root:root docsite/node_modules

COPY --chown=abc:abc . /app

# need to set before build so server/client build is optimized and has constants (if needed)
ENV NODE_ENV=production

# Optional, only affects the self-hosted docs site (/docs)
#
# Docusaurus bakes its baseUrl in at build time, unlike the main app frontend, which resolves
# its own base path at container runtime and needs nothing set here. Pass the
# same value here and as the runtime BASE_URL env var, e.g.
# --build-arg BASE_URL=http://example.com/myapp, to keep docs working under a subpath.
ARG BASE_URL=""
ENV BASE_URL=$BASE_URL

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

COPY --chown=abc:abc package*.json tsconfig.json ./
COPY --chown=abc:abc patches ./patches

RUN npm ci --omit=dev --no-audit \
    && npm cache clean --force \
    && chown -R abc:abc node_modules \
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
FROM base AS app
#
#
#

WORKDIR /app

# 
# from project, no build/stages necessary
#

# project-top-level files
COPY --chown=abc:abc *.json *.js *.ts index.html ./
# backend source files
COPY --chown=abc:abc src/backend /app/src/backend
COPY --chown=abc:abc src/core /app/src/core

# 
# from prod install stage
#

# prod dependencies
COPY --from=app-deps --chown=abc:abc /app/node_modules /app/node_modules

# 
# from app build stage
#

# frontend build from vite/esbuild
COPY --from=app-build --chown=abc:abc /app/dist /app/dist
# docs build
COPY --from=app-build --chown=abc:abc /app/docsite/build /app/docsite/build

# 
# from system-level dependency install/build
#

# node binary
COPY --from=builder /usr/bin/node /usr/bin/node

#
# ENV and ARGs for setting defaults in container
#

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
VOLUME $data_dir
ENV CONFIG_DIR=$data_dir
ENV DATA_DIR=$data_dir