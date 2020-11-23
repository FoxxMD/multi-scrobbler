import dayjs from "dayjs";
import {buildTrackString, readJson} from "../utils.js";
import MalojaScrobbler from "./MalojaScrobbler.js";

export default class ScrobbleClients {

    clients;
    logger;

    constructor(logger, clients = []) {
        this.logger = logger;
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
                    clientConfig = clientConfigs.find(x => x.type === 'maloja') || {
                        url: process.env.MALOJA_URL,
                        apiKey: process.env.MALOJA_API_KEY
                    };

                    if (Object.values(clientConfig).every(x => x === undefined)) {
                        try {
                            clientConfig = await readJson(`${configDir}/maloja.json`);
                        } catch (e) {
                            // no config exists, skip this client
                            continue;
                        }
                    }

                    const {
                        url,
                        apiKey
                    } = clientConfig;

                    if (url === undefined) {
                        this.logger.warn('Maloja url not found in config');
                        continue;
                    }
                    if (apiKey === undefined) {
                        this.logger.warn('Maloja api key not found in config');
                        continue;
                    }
                    clients.push(new MalojaScrobbler(this.logger, clientConfig));
                    break;
                default:
                    break;
            }
        }
        this.clients = clients;
    }

    scrobble = async (playObjs = [], options = {}) => {
        const {
            forceRefresh = false,
            checkTime = dayjs(),
            newTracksFromSource = playObjs.map(x => buildTrackString(x)),
            source,
        } = options;

        const tracksScrobbled = [];

        for (const client of this.clients) {
            if (forceRefresh || client.scrobblesLastCheckedAt().unix() < checkTime.unix()) {
                await client.refreshScrobbles();
            }
            for(const playObj of playObjs) {
                if (client.inValidTimeframe(playObj.data.playDate) && !client.alreadyScrobbled(playObj)) {
                    tracksScrobbled.push(playObj);
                    await client.scrobble(playObj, { foundInSourceDiff: newTracksFromSource.some(x => x === buildTrackString(playObj)), source });
                }
            }
        }
        return tracksScrobbled;
    }
}
