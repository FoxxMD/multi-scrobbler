FROM node:fermium-alpine3.10

RUN mkdir -p /home/node/app/node_modules && chown -R node:node /home/node

WORKDIR /home/node/app

COPY package*.json ./

USER node

RUN npm install

COPY --chown=node:node . .

ENV NPM_CONFIG_LOGLEVEL debug

ARG config_dir=/home/node/config
RUN mkdir -p $config_dir
VOLUME $config_dir
ENV CONFIG_DIR=$config_dir

EXPOSE 9078

CMD [ "node", "index.js" ]
