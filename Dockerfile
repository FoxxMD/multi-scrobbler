FROM lsiobase/alpine:3.17 as base

ENV TZ=Etc/GMT

RUN \
  echo "**** install build packages ****" && \
  apk add --no-cache \
    alpine-base \
    git \
    nodejs \
    npm \
    openssh && \
  echo "**** cleanup ****" && \
  rm -rf \
    /root/.cache \
    /tmp/*

RUN ln -snf /usr/share/zoneinfo/$TZ /etc/localtime && echo $TZ > /etc/timezone

ARG data_dir=/config
VOLUME $data_dir
ENV CONFIG_DIR=$data_dir

COPY docker/root/ /

WORKDIR /app

FROM base as build

# copy NPM dependencies and install
COPY --chown=abc:abc package*.json ./
COPY --chown=abc:abc tsconfig.json .

RUN npm install

COPY --chown=abc:abc . /app

RUN npm run build && rm -rf node_modules

FROM base as app

COPY --from=build --chown=abc:abc /app /app

ENV NODE_ENV="production"

RUN npm install --omit=dev \
    && npm cache clean --force \
    && chown abc:abc node_modules \
    && rm -rf node_modules/ts-node \
    && rm -rf node_modules/typescript

ARG webPort=9078
ENV PORT=$webPort
EXPOSE $PORT
