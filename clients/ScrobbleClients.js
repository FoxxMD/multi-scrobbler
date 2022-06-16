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

    /** @type AbstractScrobbleClient[] */
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

    getByType = (type) => {
        return this.clients.filter(x => x.type === type);
    }

    buildClientsFromConfig = async () => {
        let configs = [];

        let configFile;
        try {
            configFile = await readJson(`${this.configDir}/config.json`, {throwOnNotFound: false});
        } catch (e) {
            // think this should stay as show-stopper since config could include important defaults (delay, retries) we don't want to ignore
            throw new Error('config.json could not be parsed');
        }
        let clientDefaults = {};
        if (configFile !== undefined) {
            const {
                clients: mainConfigClientConfigs = [],
                clientDefaults: cd = {},
            } = configFile;
            clientDefaults = cd;
            const validMainConfigs = mainConfigClientConfigs.reduce((acc, curr, i) => {
                if(curr === null) {
                    this.logger.error(`The client config entry at index ${i} in config.json is null but should be an object, will not parse`);
                    return acc;
                }
                if(typeof curr !== 'object') {
                    this.logger.error(`The client config entry at index ${i} in config.json should be an object, will not parse`);
                    return acc;
                }
                return acc.concat(curr);
            }, []);
            for (const c of validMainConfigs) {
                const {name = 'unnamed'} = c;
                configs.push({...c,
                    name,
                    source: 'config.json',
                    configureAs: 'client', //override user value
                });
            }
        }

        for (const clientType of this.clientTypes) {
            let defaultConfigureAs = 'client';
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
                this.logger.error(`${clientType}.json config file could not be parsed`);
                continue;
            }
            if (rawClientConfigs !== undefined) {
                let clientConfigs = [];
                if (Array.isArray(rawClientConfigs)) {
                    clientConfigs = rawClientConfigs;
                } else if(rawClientConfigs === null) {
                    this.logger.error(`${clientType}.json contained no data`);
                    continue;
                } else if (typeof rawClientConfigs === 'object') {
                    // backwards compatibility, assuming its single-user mode
                    this.logger.warn(`DEPRECATED: Starting in 0.4 configurations in all [type].json files (${clientType}.json) must be in an array.`);
                    if (rawClientConfigs.data === undefined) {
                        clientConfigs = [{data: rawClientConfigs, mode: 'single', name: 'unnamed'}];
                    } else {
                        clientConfigs = [rawClientConfigs];
                    }
                } else {
                    this.logger.error(`All top level data from ${clientType}.json must be an array of objects, will not parse configs from file`);
                    continue;
                }
                for (const [i,m] of clientConfigs.entries()) {
                    if(m === null) {
                        this.logger.error(`The config entry at index ${i} from ${clientType}.json is null`);
                        continue;
                    }
                    if (typeof m !== 'object') {
                        this.logger.error(`The config entry at index ${i} from ${clientType}.json was not an object, skipping`, m);
                        continue;
                    }
                    const {configureAs = defaultConfigureAs} = m;
                    if(configureAs === 'client') {
                        m.source = `${clientType}.json`;
                        m.type = clientType;
                        configs.push(m);
                    }
                }
            }
        }

        // we have all possible client configurations so we'll check they are minimally valid
        const validConfigs = configs.reduce((acc, c) => {
            const isValid = isValidConfigStructure(c, {type: true, data: true});
            if (isValid !== true) {
                this.logger.error(`Client config from ${c.source} with name [${c.name || 'unnamed'}] of type [${c.type || 'unknown'}] will not be used because it has structural errors: ${isValid.join(' | ')}`);
                return acc;
            }
            return acc.concat(c);
        }, []);

        // all client configs are minimally valid
        // now check that names are unique
        const nameGroupedConfigs = validConfigs.reduce((acc, curr) => {
            const {name = 'unnamed'} = curr;
            const {[name]: n = []} = acc;
            return {...acc, [name]: [...n, curr]};
        }, {});
        let noConflictConfigs = [];
        for (const [name, configs] of Object.entries(nameGroupedConfigs)) {
            if (configs.length > 1) {
                const sources = configs.map(c => `Config object from ${c.source} of type [${c.type}]`);
                this.logger.error(`The following clients will not be built because of config naming conflicts (they have the same name of "${name}"): 
${sources.join('\n')}`);
                if (name === 'unnamed') {
                    this.logger.info('HINT: "unnamed" configs occur when using ENVs, if a multi-user mode config does not have a "name" property, or if a config is built in single-user mode');
                }
            } else {
                noConflictConfigs = [...noConflictConfigs, ...configs];
            }
        }

        // finally! all configs are valid, structurally, and can now be passed to addClient
        // just need to re-map unnnamed to default
        const finalConfigs = noConflictConfigs.map(({name = 'unnamed', ...x}) => ({
            ...x,
            name
        }));
        for (const c of finalConfigs) {
            try {
                await this.addClient(c, clientDefaults);
            } catch(e) {
                this.logger.error(`Client ${c.name} was not added because it had unrecoverable errors`);
                this.logger.error(e);
            }
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
        let newClient;
        this.logger.debug(`(${name}) Constructing ${type} client...`);
        switch (type) {
            case 'maloja':
                newClient = new MalojaScrobbler(name, data);
                break;
            case 'lastfm':
                newClient = new LastfmScrobbler(name, {...data, configDir: this.configDir});
                break;
            default:
                break;
        }

        if(newClient === undefined) {
            // really shouldn't get here!
            throw new Error(`Client of type ${type} was not recognized??`);
        }
        if(newClient.initialized === false) {
            this.logger.debug(`(${name}) Attempting ${type} initialization...`);
            if (await newClient.initialize() === false) {
                this.logger.error(`(${name}) ${type} client failed to initialize. Client needs to be successfully initialized before scrobbling.`);
            } else {
                this.logger.info(`(${name}) ${type} client initialized`);
            }
        }
        if(newClient.requiresAuth && !newClient.authed) {
            this.logger.debug(`(${name}) Checking ${type} client auth...`);
            let success;
            try {
                success = await newClient.testAuth();
            } catch (e) {
                success = false;
            }
            if(!success) {
                this.logger.warn(`(${name}) ${type} client auth failed.`);
            } else {
                this.logger.info(`(${name}) ${type} client auth OK`);
            }
        }
        this.clients.push(newClient);
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
            if(!client.initialized) {
                if(client.initializing) {
                    this.logger.warn(`Cannot scrobble to Client '${client.name}' because it is still initializing`);
                    continue;
                }
                if(!(await client.initialize())) {
                    this.logger.warn(`Cannot scrobble to Client '${client.name}' because it could not be initialized`);
                    continue;
                }
            }

            if(client.requiresAuth && !client.authed) {
                if (client.requiresAuthInteraction) {
                    this.logger.warn(`Cannot scrobble to Client '${client.name}' because user interaction is required for authentication`);
                    continue;
                } else if (!(await client.testAuth())) {
                    this.logger.warn(`Cannot scrobble to Client '${client.name}' because auth test failed`);
                    continue;
                }
            }

            if(!(await client.isReady())) {
                this.logger.warn(`Cannot scrobble to Client '${client.name}' because it is not ready`);
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
                    if (client.timeFrameIsValid(playObj, newFromSource) && !(await client.alreadyScrobbled(playObj, newFromSource))) {
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
