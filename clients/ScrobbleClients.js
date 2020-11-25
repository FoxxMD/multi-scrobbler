import dayjs from "dayjs";
import {createLabelledLogger, readJson} from "../utils.js";
import MalojaScrobbler from "./MalojaScrobbler.js";

export default class ScrobbleClients {

    clients;
    logger;

    constructor(clients = []) {
        this.logger = createLabelledLogger('name', 'Scrobblers');
        this.clients = clients;
    }

    buildClients = async (clientConfigs = [], configDir = undefined) => {
        const clients = [];
        if (!clientConfigs.every(x => typeof x === 'object')) {
            throw new Error('All client from config json must be objects');
        }
        for (const clientType of ['maloja']) {

            let clientConfig = {};

            switch (clientType) {
                case 'maloja':
                    this.logger.debug('Attempting Maloja initialization...');
                    const configObj = clientConfigs.find((x = {}) => x.type === 'maloja');
                    const {data} = configObj || {};
                    clientConfig = data || {
                        url: process.env.MALOJA_URL,
                        apiKey: process.env.MALOJA_API_KEY
                    };

                    if (Object.values(clientConfig).every(x => x === undefined)) {
                        const filePath = `${configDir}/maloja.json`;
                        try {
                            clientConfig = await readJson(filePath, {throwOnNotFound: false});
                        } catch (e) {
                            this.logger.warn(`Maloja config file could not be read, skipping initialization`);
                            continue;
                        }
                    }
                    if (clientConfig === undefined) {
                        this.logger.warn('No config data passed for Maloja and no config file could be found, skipping initialization');
                        continue;
                    }

                    const {
                        url,
                        apiKey
                    } = clientConfig;

                    if (url === undefined) {
                        this.logger.warn('Maloja url not found in config, not initializing');
                        continue;
                    }
                    if (apiKey === undefined) {
                        this.logger.warn('Maloja api key not found in config! Client will most likely fail when trying to scrobble');
                    }
                    const mj = new MalojaScrobbler(clientConfig);
                    const testSuccess = await mj.testConnection();
                    if (testSuccess === false) {
                        this.logger.warn('Maloja client not initialized due to failure during connection testing');
                    } else {
                        this.logger.info('Maloja client initialized');
                        clients.push(mj);
                    }
                    break;
                default:
                    break;
            }
        }
        this.clients = clients;
    }

    scrobble = async (data, options = {}) => {
        const playObjs = Array.isArray(data) ? data : [data];
        const {
            forceRefresh = false,
            checkTime = dayjs(),
        } = options;

        const tracksScrobbled = [];

        if (this.clients.length === 0) {
            this.logger.warn('Cannot scrobble! No clients are configured.');
        }

        for (const client of this.clients) {
            try {
                if (forceRefresh || client.scrobblesLastCheckedAt().unix() < checkTime.unix()) {
                    await client.refreshScrobbles();
                }
                for (const playObj of playObjs) {
                    const {
                        meta: {
                            newFromSource = false,
                        } = {}
                    } = playObj;
                    if (client.timeFrameIsValid(playObj, newFromSource) && !client.alreadyScrobbled(playObj, newFromSource)) {
                        tracksScrobbled.push(playObj);
                        await client.scrobble(playObj);
                    }
                }
            } catch (e) {
                this.logger.error(`Encountered error while in scrobble loop for ${client.name}`);
                this.logger.error(e);
            }
        }
        return tracksScrobbled;
    }
}
