import dayjs from "dayjs";
import {
    createLabelledLogger,
    isValidConfigStructure,
    playObjDataMatch,
    readJson,
    returnDuplicateStrings
} from "../utils.js";
import MalojaScrobbler from "./MalojaScrobbler.js";
import LastfmScrobbler from "./LastfmScrobbler.js";

export default class ScrobbleClients {

    clients = [];
    logger;
    configDir;

    clientTypes = ['maloja','lastfm'];

    constructor(configDir) {
        this.configDir = configDir;
        this.logger = createLabelledLogger('scrobblers', 'Scrobblers');
    }

    getByName = (name) => {
        return this.clients.find(x => x.name === name);
    }

    buildClientsFromConfig = async () => {
        let configs = [];

        let configFile;
        try {
            configFile = await readJson(`${this.configDir}/config.json`, {throwOnNotFound: false});
        } catch (e) {
            throw new Error('config.json could not be parsed');
        }
        let clientDefaults = {};
        if (configFile !== undefined) {
            const {
                clients: mainConfigClientConfigs = [],
                clientDefaults: cd = {},
            } = configFile;
            clientDefaults = cd;
            if (!mainConfigClientConfigs.every(x => x !== null && typeof x === 'object')) {
                throw new Error('All clients from config.json must be objects');
            }
            for (const c of mainConfigClientConfigs) {
                const {name = 'unnamed'} = c;
                configs.push({...c, name, source: 'config.json'});
            }
        }

        for (const clientType of this.clientTypes) {
            switch (clientType) {
                case 'maloja':
                    // env builder for single user mode
                    const url = process.env.MALOJA_URL;
                    const apiKey = process.env.MALOJA_API_KEY;
                    if (url !== undefined || apiKey !== undefined) {
                        configs.push({
                            type: 'maloja',
                            name: 'unnamed',
                            source: 'ENV',
                            mode: 'single',
                            data: {
                                url,
                                apiKey
                            }
                        })
                    }
                    break;
                case 'lastfm':
                    const lfm = {
                        apiKey: process.env.LASTFM_API_KEY,
                        secret: process.env.LASTFM_SECRET,
                        redirectUri: process.env.LASTFM_REDIRECT_URI,
                        session: process.env.LASTFM_SESSION,
                    };
                    if (!Object.values(lfm).every(x => x === undefined)) {
                        configs.push({
                            type: 'lastfm',
                            name: 'unnamed',
                            source: 'ENV',
                            mode: 'single',
                            data: lfm
                        })
                    }
                    break;
                default:
                    break;
            }
            let rawClientConfigs;
            try {
                rawClientConfigs = await readJson(`${this.configDir}/${clientType}.json`, {throwOnNotFound: false});
            } catch (e) {
                throw new Error(`${clientType}.json config file could not be parsed`);
            }
            if (rawClientConfigs !== undefined) {
                let clientConfigs = [];
                if (Array.isArray(rawClientConfigs)) {
                    clientConfigs = rawClientConfigs;
                } else if (rawClientConfigs === null || typeof rawClientConfigs === 'object') {
                    // backwards compatibility, assuming its single-user mode
                    if (rawClientConfigs.data === undefined) {
                        clientConfigs = [{data: rawClientConfigs, mode: 'single', name: 'unnamed'}];
                    } else {
                        clientConfigs = [rawClientConfigs];
                    }
                } else {
                    throw new Error(`All top level data from ${clientType}.json must be an object or array of objects`);
                }
                for (const m of clientConfigs) {
                    if (m === null || typeof m !== 'object') {
                        throw new Error(`All top-level data from ${clientType}.json must be an object or array of objects`);
                    }
                    m.source = `${clientType}.json`;
                    m.type = clientType;
                    configs.push(m);
                }
            }
        }

        // we have all possible client configurations so we'll check they are minimally valid
        const configErrors = configs.reduce((acc, c) => {
            const isValid = isValidConfigStructure(c, {type: true, data: true});
            if (isValid !== true) {
                const msg = `Client config from ${c.source} with name [${c.name || 'unnamed'}] of type [${c.type || 'unknown'}] has errors: ${isValid.join(' | ')}`;
                return acc.concat(msg);
            }
            return acc;
        }, []);
        if (configErrors.length > 0) {
            for (const m of configErrors) {
                this.logger.error(m);
            }
            throw new Error('Could not build clients due to above errors');
        }

        // all client configs are minimally valid
        // now check that names are unique
        const nameGroupedConfigs = configs.reduce((acc, curr) => {
            const {name = 'unnamed'} = curr;
            const {[name]: n = []} = acc;
            return {...acc, [name]: [...n, curr]};
        }, {});
        let nameErrors = false;
        for (const [name, configs] of Object.entries(nameGroupedConfigs)) {
            if (configs.length > 1) {
                const sources = configs.map(c => `Config object from ${c.source} of type [${c.type}]`);
                this.logger.error(`Client config naming conflicts -- the following configs have the same name "${name}": 
${sources.join('\n')}`);
                nameErrors = true;
                if (name === 'unnamed') {
                    this.logger.info('HINT: "unnamed" configs occur when using ENVs, if a multi-user mode config does not have a "name" property, or if a config is built in single-user mode');
                }
            }
        }
        if (nameErrors) {
            throw new Error('Could not build clients due to naming conflicts');
        }

        // finally! all configs are valid, structurally, and can now be passed to addClient
        // just need to re-map unnnamed to default
        const finalConfigs = configs.map(({name = 'unnamed', ...x}) => ({
            ...x,
            name
        }));
        for (const c of finalConfigs) {
            await this.addClient(c, clientDefaults);
        }
    }

    addClient = async (clientConfig, defaults = {}) => {
        const isValidConfig = isValidConfigStructure(clientConfig, {name: true, data: true, type: true});
        if (isValidConfig !== true) {
            throw new Error(`Config object from ${clientConfig.source || 'unknown'} with name [${clientConfig.name || 'unnamed'}] of type [${clientConfig.type || 'unknown'}] has errors: ${isValidConfig.join(' | ')}`)
        }
        const {type, name, data: d = {}} = clientConfig;
        // add defaults
        const data = {...defaults, ...d};
        switch (type) {
            case 'maloja':
                this.logger.debug(`(${name}) Attempting Maloja initialization...`);
                const mj = new MalojaScrobbler(name, data);
                const testSuccess = await mj.testConnection();
                if (testSuccess === false) {
                    throw new Error(`(${name}) Maloja client not initialized due to failure during connection testing`);
                } else {
                    this.logger.info(`(${name}) Maloja client initialized`);
                    this.clients.push(mj)
                }
                break;
            case 'lastfm':
                this.logger.debug(`(${name}) Attempting Lastfm initialization...`);
                const lfm = new LastfmScrobbler(name, {...data, configDir: this.configDir});
                try {
                    await lfm.initialize()
                    this.logger.info(`(${name}) Lastfm client initialized`);
                    this.clients.push(lfm)
                } catch(e) {
                    this.logger.info(`(${name}) Could not initialize Lastfm client`)
                }
                break;
            default:
                break;
        }
    }

    /**
     * @param {*} data
     * @param {{scrobbleFrom, scrobbleTo, forceRefresh: boolean}|{scrobbleFrom, scrobbleTo}} options
     * @returns {Array}
     */
    scrobble = async (data, options = {}) => {
        const playObjs = Array.isArray(data) ? data : [data];
        const {
            forceRefresh = false,
            checkTime = dayjs(),
            scrobbleTo = [],
            scrobbleFrom = 'source',
        } = options;

        const tracksScrobbled = [];

        if (this.clients.length === 0) {
            this.logger.warn('Cannot scrobble! No clients are configured.');
        }

        for (const client of this.clients) {
            if (scrobbleTo.length > 0 && !scrobbleTo.includes(client.name)) {
                this.logger.debug(`Client '${client.name}' was filtered out by '${scrobbleFrom}'`);
                continue;
            }
            if(client.initialized === false) {
                this.logger.debug(`Client '${client.name}' is not yet initialized (check authorization?)`);
                continue;
            }

                if (forceRefresh || client.scrobblesLastCheckedAt().unix() < checkTime.unix()) {
                    try {
                        await client.refreshScrobbles();
                    } catch(e) {
                        this.logger.error(`Encountered error while refreshing scrobbles for ${client.name}`);
                        this.logger.error(e);
                    }
                }
                for (const playObj of playObjs) {
                    try {
                        const {
                            meta: {
                                newFromSource = false,
                            } = {}
                        } = playObj;
                        if (client.timeFrameIsValid(playObj, newFromSource) && !client.alreadyScrobbled(playObj, newFromSource)) {
                            await client.scrobble(playObj)
                            client.tracksScrobbled++;
                            // since this is what we return to the source only add to tracksScrobbled if not already in array
                            // (source should only know that a track was scrobbled (binary) -- doesn't care if it was scrobbled more than once
                            if(!tracksScrobbled.some(x => playObjDataMatch(x, playObj) && x.data.playDate === playObj.data.playDate)) {
                                tracksScrobbled.push(playObj);
                            }
                        }
                    } catch(e) {
                        this.logger.error(`Encountered error while in scrobble loop for ${client.name}`);
                        this.logger.error(e);
                        // for now just stop scrobbling plays for this client and move on. the client should deal with logging the issue
                        if(e.continueScrobbling !== true) {
                            break;
                        }
                    }
                }
        }
        return tracksScrobbled;
    }
}
