FROM ghcr.io/linuxserver/baseimage-ubuntu:jammy as base

ENV TZ=Etc/GMT

RUN \
  echo "**** install build packages ****" && \
    apt-get update && \
    apt-get install --no-install-recommends -y \
        curl && \
    curl -sL https://deb.nodesource.com/setup_18.x | bash - && \
    apt-get install --no-install-recommends -y nodejs && \
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

ARG data_dir=/config
VOLUME $data_dir
ENV CONFIG_DIR=$data_dir

COPY docker/root /

RUN npm install -g patch-package \
    && chown -R root:root /usr/lib/node_modules/patch-package

WORKDIR /app

FROM base as build

COPY --chown=abc:abc package*.json tsconfig.json ./
COPY --chown=abc:abc patches ./patches


RUN npm install --verbose \
    && chown -R root:root node_modules

COPY --chown=abc:abc . /app

# need to set before build so server/client build is optimized and has constants (if needed)
ENV NODE_ENV=production

RUN npm run build && rm -rf node_modules

FROM base as app

COPY --chown=abc:abc package*.json ./
COPY --chown=abc:abc patches ./patches
COPY --from=build --chown=abc:abc /app/dist /app/dist
COPY --from=build --chown=abc:abc /app/src /app/src
COPY --from=base /usr/bin /usr/bin
COPY --from=base /usr/lib /usr/lib

ENV NODE_ENV=production
ENV IS_DOCKER=true

RUN npm install --omit=dev \
    && npm cache clean --force \
    && chown -R abc:abc node_modules \
    && rm -rf node_modules/@types \
              /root/.cache

ARG webPort=9078
ENV PORT=$webPort
EXPOSE $PORT
