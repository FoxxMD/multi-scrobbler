import {createLabelledLogger, isValidConfigStructure, readJson} from "../utils.js";
import SpotifySource from "./SpotifySource.js";
import PlexSource from "./PlexSource.js";
import TautulliSource from "./TautulliSource.js";
import {SubsonicSource} from "./SubsonicSource.js";
import JellyfinSource from "./JellyfinSource.js";
import LastfmSource from "./LastfmSource.js";

export default class ScrobbleSources {

    sources = [];
    logger;
    configDir;
    localUrl;

    sourceTypes = ['spotify', 'plex', 'tautulli', 'subsonic', 'jellyfin', 'lastfm'];

    constructor(localUrl, configDir = process.cwd()) {
        this.configDir = configDir;
        this.localUrl = localUrl;
        this.logger = createLabelledLogger('sources', 'Sources');
    }

    getByName = (name) => {
        return this.sources.find(x => x.name === name);
    }

    getByType = (type) => {
        return this.sources.filter(x => x.type === type);
    }

    getByNameAndType = (name, type) => {
        return this.sources.find(x => x.name === name && x.type === type);
    }

    buildSourcesFromConfig = async (additionalConfigs = []) => {
        let configs = additionalConfigs;

        let configFile;
        try {
            configFile = await readJson(`${this.configDir}/config.json`, {throwOnNotFound: false});
        } catch (e) {
            throw new Error('config.json could not be parsed');
        }
        let sourceDefaults = {};
        if (configFile !== undefined) {
            const {
                sources: mainConfigSourcesConfigs = [],
                sourceDefaults: sd = {},
            } = configFile;
            sourceDefaults = sd;
            const validMainConfigs = mainConfigSourcesConfigs.reduce((acc, curr, i) => {
                if(curr === null) {
                    this.logger.error(`The source config entry at index ${i} in config.json is null but should be an object, will not parse`);
                    return acc;
                }
                if(typeof curr !== 'object') {
                    this.logger.error(`The source config entry at index ${i} in config.json should be an object, will not parse`);
                    return acc;
                }
                return acc.concat(curr);
            }, []);
            for (const c of validMainConfigs) {
                const {name = 'unnamed'} = c;
                configs.push({...c,
                    name,
                    source: 'config.json',
                    configureAs: 'source' // override user value
                });
            }
        }

        for (let sourceType of this.sourceTypes) {
            let defaultConfigureAs = 'source';
            // env builder for single user mode
            switch (sourceType) {
                case 'spotify':
                    const s = {
                        accessToken: process.env.SPOTIFY_ACCESS_TOKEN,
                        clientId: process.env.SPOTIFY_CLIENT_ID,
                        clientSecret: process.env.SPOTIFY_CLIENT_SECRET,
                        redirectUri: process.env.SPOTIFY_REDIRECT_URI,
                        refreshToken: process.env.SPOTIFY_REFRESH_TOKEN,
                    };
                    if (!Object.values(s).every(x => x === undefined)) {
                        configs.push({
                            type: 'spotify',
                            name: 'unnamed',
                            source: 'ENV',
                            mode: 'single',
                            data: s
                        })
                    }
                    break;
                case 'tautulli':
                    const t = {
                        // support this for now
                        user: process.env.TAUTULLI_USER || process.env.PLEX_USER
                    };
                    if (!Object.values(t).every(x => x === undefined)) {
                        configs.push({
                            type: 'tautulli',
                            name: 'unnamed',
                            source: 'ENV',
                            mode: 'single',
                            data: t
                        })
                    }
                    break;
                case 'plex':
                    const p = {
                        user: process.env.PLEX_USER
                    };
                    if (!Object.values(p).every(x => x === undefined)) {
                        configs.push({
                            type: 'plex',
                            name: 'unnamed',
                            source: 'ENV',
                            mode: 'single',
                            data: p
                        })
                    }
                    break;
                case 'subsonic':
                    const sub = {
                        user: process.env.SUBSONIC_USER,
                        password: process.env.SUBSONIC_PASSWORD,
                        url: process.env.SUBSONIC_URL,
                    };
                    if (!Object.values(sub).every(x => x === undefined)) {
                        configs.push({
                            type: 'subsonic',
                            name: 'unnamed',
                            source: 'ENV',
                            mode: 'single',
                            data: sub
                        })
                    }
                    break;
                case 'jellyfin':
                    const j = {
                        user: process.env.JELLYFIN_USER,
                        server: process.env.JELLYFIN_SERVER,
                    };
                    if (!Object.values(j).every(x => x === undefined)) {
                        configs.push({
                            type: 'jellyfin',
                            name: 'unnamed',
                            source: 'ENV',
                            mode: 'single',
                            data: j
                        })
                    }
                    break;
                case 'lastfm':
                    // sane default for lastfm is that user want to scrobble TO it, not FROM it -- this is also existing behavior
                    defaultConfigureAs = 'client';
                    break;
                default:
                    break;
            }
            let rawSourceConfigs;
            try {
                rawSourceConfigs = await readJson(`${this.configDir}/${sourceType}.json`, {throwOnNotFound: false});
            } catch (e) {
                this.logger.error(`${sourceType}.json config file could not be parsed`);
                continue;
            }
            if (rawSourceConfigs !== undefined) {
                let sourceConfigs = [];
                if (Array.isArray(rawSourceConfigs)) {
                    sourceConfigs = rawSourceConfigs;
                } else if (rawSourceConfigs === null) {
                    this.logger.error(`${sourceType}.json contained no data`);
                    continue;
                } else if (typeof rawSourceConfigs === 'object') {
                    // backwards compatibility, assuming its single-user mode
                    this.logger.warn(`DEPRECATED: Starting in 0.4 configurations in all [type].json files (${sourceType}.json) must be in an array.`);
                    if (rawSourceConfigs.data === undefined) {
                        sourceConfigs = [{data: rawSourceConfigs, mode: 'single', name: 'unnamed'}];
                    } else {
                        sourceConfigs = [rawSourceConfigs];
                    }
                } else {
                    this.logger.error(`All top level data from ${sourceType}.json must be an array of objects, will not parse configs from file`);
                    continue;
                }
                for (const [i,m] of sourceConfigs.entries()) {
                    if(m === null) {
                        this.logger.error(`The config entry at index ${i} from ${sourceType}.json is null`);
                        continue;
                    }
                    if (typeof m !== 'object') {
                        this.logger.error(`The config entry at index ${i} from ${sourceType}.json was not an object, skipping`, m);
                        continue;
                    }
                    const {configureAs = defaultConfigureAs} = m;
                    if(configureAs === 'source') {
                        m.source = `${sourceType}.json`;
                        m.type = sourceType;
                        configs.push(m);
                    }
                }
            }
        }

        // we have all possible configurations so we'll check they are minimally valid
        const validConfigs = configs.reduce((acc, c) => {
            const isValid = isValidConfigStructure(c, {type: true, data: true});
            if (isValid !== true) {
                this.logger.error(`Source config from ${c.source} with name [${c.name || 'unnamed'}] of type [${c.type || 'unknown'}] will not be used because it has structural errors: ${isValid.join(' | ')}`);
            }
            return acc.concat(c);
        }, []);

        // finally! all configs are valid, structurally, and can now be passed to addClient
        // do a last check that names (within each type) are unique and warn if not, but add anyways
        const typeGroupedConfigs = validConfigs.reduce((acc, curr) => {
            const {type} = curr;
            const {[type]: t = []} = acc;
            return {...acc, [type]: [...t, curr]};
        }, {});
        // only need to warn if dup names PER TYPE
        for (const [type, typedConfigs] of Object.entries(typeGroupedConfigs)) {
            const nameGroupedConfigs = typedConfigs.reduce((acc, curr) => {
                const {name = 'unnamed'} = curr;
                const {[name]: n = []} = acc;
                return {...acc, [name]: [...n, curr]};
            }, {});
            for (const [name, namedConfigs] of Object.entries(nameGroupedConfigs)) {
                let tempNamedConfigs = namedConfigs;
                const hasDups = namedConfigs.length > 1;
                if (hasDups) {
                    const sources = namedConfigs.map(c => `Config object from ${c.source} of type [${c.type}]`);
                    this.logger.warn(`Source configs have naming conflicts -- the following configs have the same name "${name}":\n\n${sources.join('\n')}\n`);
                    if (name === 'unnamed') {
                        this.logger.info('HINT: "unnamed" configs occur when using ENVs, if a multi-user mode config does not have a "name" property, or if a config is built in single-user mode');
                    }
                }
                tempNamedConfigs = tempNamedConfigs.map(({name = 'unnamed', ...x}, i) => ({
                    ...x,
                    name: hasDups ? `${name}${i + 1}` : name
                }));
                for (const c of tempNamedConfigs) {
                    try {
                        await this.addSource(c, sourceDefaults);
                    } catch(e) {
                        this.logger.error(`Source ${c.name} of type ${c.type} was not added because of unrecoverable errors`);
                        this.logger.error(e);
                    }
                }
            }
        }
    }

    addSource = async (clientConfig, defaults = {}) => {
        const isValidConfig = isValidConfigStructure(clientConfig, {name: true, data: true, type: true});
        if (isValidConfig !== true) {
            throw new Error(`Config object from ${clientConfig.source || 'unknown'} with name [${clientConfig.name || 'unnamed'}] of type [${clientConfig.type || 'unknown'}] has errors: ${isValidConfig.join(' | ')}`)
        }
        const {type, name, clients = [], data: d = {}} = clientConfig;
        // add defaults
        const data = {...defaults, ...d};
        this.logger.debug(`(${name}) Initializing ${type} source`);
        switch (type) {
            case 'spotify':
                const spotifySource = new SpotifySource(name, {
                    ...data,
                    localUrl: this.localUrl,
                    configDir: this.configDir
                }, clients);
                await spotifySource.buildSpotifyApi();
                this.sources.push(spotifySource);
                break;
            case 'plex':
                const plexSource = await new PlexSource(name, data, clients);
                this.sources.push(plexSource);
                break;
            case 'tautulli':
                const tautulliSource = await new TautulliSource(name, data, clients);
                this.sources.push(tautulliSource);
                break;
            case 'subsonic':
                const ssSource = new SubsonicSource(name, data, clients);
                await ssSource.testConnection();
                this.sources.push(ssSource);
                break;
            case 'jellyfin':
                const jellyfinSource = await new JellyfinSource(name, data, clients);
                this.sources.push(jellyfinSource);
                break;
            case 'lastfm':
                const lastfmSource = await new LastfmSource(name, {...data, configDir: this.configDir}, clients);
                await lastfmSource.initialize();
                this.sources.push(lastfmSource);
                break;
            default:
                break;
        }
        this.logger.info(`(${name}) ${type} source initialized`);
    }
}
