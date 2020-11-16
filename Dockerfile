FROM node:fermium-alpine3.10

ENV TZ=Etc/GMT

RUN ln -snf /usr/share/zoneinfo/$TZ /etc/localtime && echo $TZ > /etc/timezone

RUN mkdir -p /home/node/app/node_modules && chown -R node:node /home/node

WORKDIR /home/node/app

COPY package*.json ./

USER node

RUN npm install --production

COPY --chown=node:node . .

ENV NPM_CONFIG_LOGLEVEL debug

ARG config_dir=/home/node/config
RUN mkdir -p $config_dir
VOLUME $config_dir
ENV CONFIG_DIR=$config_dir

ARG log_dir=/home/node/logs
RUN mkdir -p $log_dir
VOLUME $log_dir
ENV LOG_DIR=$log_dir

ARG webPort=9078
ENV PORT=$webPort
EXPOSE $PORT

CMD [ "node", "index.js" ]
