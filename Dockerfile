FROM ghcr.io/linuxserver/baseimage-debian:bookworm AS base

ENV TZ=Etc/GMT
ENV NODE_VERSION=20.18.1

# borrowing openssl header removal trick from offical docker-node
# https://github.com/nodejs/docker-node/blob/main/18/bookworm-slim/Dockerfile#L8
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
        #ca-certificates \
        xz-utils \
        avahi-utils \
        curl && \
  echo "**** Fetch and install node****" && \
    # get node/npm directly from nodejs dist \
    # https://github.com/nodejs/docker-node/blob/main/18/bookworm-slim/Dockerfile#L41
    curl -fsSLO --compressed "https://nodejs.org/dist/v$NODE_VERSION/node-v$NODE_VERSION-linux-$ARCH.tar.xz" && \
    tar -xJf "node-v$NODE_VERSION-linux-$ARCH.tar.xz" -C /usr --strip-components=1 --no-same-owner && \
    rm "node-v$NODE_VERSION-linux-$ARCH.tar.xz" && \
    ln -s /usr/bin/node /usr/bin/nodejs && \
    npm update -g npm && \
  echo "**** cleanup ****" && \
    # https://github.com/nodejs/docker-node/blob/main/18/bookworm-slim/Dockerfile#L49
    # Remove unused OpenSSL headers to save ~34MB
    # (does not affect arm64 issue below)
    find /usr/include/node/openssl/archs -mindepth 1 -maxdepth 1 ! -name "$OPENSSL_ARCH" -exec rm -rf {} \; && \
    apt-get purge --auto-remove -y perl xz-utils && \
    apt-get autoclean && \
    apt-get autoremove && \
      rm -rf \
        /config/.cache \
        /root/cache \
        /var/lib/apt/lists/* \
        /var/tmp/* \
        /tmp/*

RUN ln -snf /usr/share/zoneinfo/$TZ /etc/localtime && echo $TZ > /etc/timezone

RUN npm install -g concurrently

ARG data_dir=/config
VOLUME $data_dir
ENV CONFIG_DIR=$data_dir

COPY docker/root /

WORKDIR /app

FROM base AS build

COPY --chown=abc:abc package*.json tsconfig.json ./
COPY --chown=abc:abc patches ./patches
COPY --chown=abc:abc docsite/package*.json tsconfig.json ./docsite/

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

RUN npm run build:parallel && rm -rf node_modules && rm -rf docsite/node_modules

FROM base AS app

COPY --chown=abc:abc *.json *.js *.ts index.html ./
COPY --chown=abc:abc patches ./patches
COPY --from=build --chown=abc:abc /app/dist /app/dist
COPY --from=build --chown=abc:abc /app/src /app/src
COPY --from=build --chown=abc:abc /app/docsite /app/docsite
COPY --from=base /usr/bin /usr/bin
COPY --from=base /usr/lib /usr/lib

ENV NODE_ENV=production
ENV IS_DOCKER=true

# https://stackoverflow.com/a/63640896/1469797
ARG APP_BUILD_VERSION
ENV APP_VERSION=$APP_BUILD_VERSION

RUN npm ci --omit=dev --no-audit \
    && npm cache clean --force \
    && chown -R abc:abc node_modules \
    && rm -rf /root/.cache


ARG webPort=9078
ENV PORT=$webPort
EXPOSE $PORT
