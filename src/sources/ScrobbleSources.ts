import {createLabelledLogger, isValidConfigStructure, readJson} from "../utils.js";
import SpotifySource from "./SpotifySource.js";
import PlexSource from "./PlexSource.js";
import TautulliSource from "./TautulliSource.js";
import {SubsonicSource} from "./SubsonicSource.js";
import JellyfinSource from "./JellyfinSource.js";
import LastfmSource from "./LastfmSource.js";
import DeezerSource from "./DeezerSource.js";

export default class ScrobbleSources {

    sources = [];
    logger;
    configDir;
    localUrl;

    sourceTypes = ['spotify', 'plex', 'tautulli', 'subsonic', 'jellyfin', 'lastfm', 'deezer'];

    constructor(localUrl: any, configDir = process.cwd()) {
        this.configDir = configDir;
        this.localUrl = localUrl;
        this.logger = createLabelledLogger('sources', 'Sources');
    }

    getByName = (name: any) => {
        // @ts-expect-error TS(2339): Property 'name' does not exist on type 'never'.
        return this.sources.find(x => x.name === name);
    }

    getByType = (type: any) => {
        // @ts-expect-error TS(2339): Property 'type' does not exist on type 'never'.
        return this.sources.filter(x => x.type === type);
    }

    getByNameAndType = (name: any, type: any) => {
        // @ts-expect-error TS(2339): Property 'name' does not exist on type 'never'.
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
            const validMainConfigs = mainConfigSourcesConfigs.reduce((acc: any, curr: any, i: any) => {
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
                    // @ts-expect-error TS(2322): Type 'any' is not assignable to type 'never'.
                    name,
                    // @ts-expect-error TS(2322): Type 'string' is not assignable to type 'never'.
                    source: 'config.json',
                    // @ts-expect-error TS(2322): Type 'string' is not assignable to type 'never'.
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
                            // @ts-expect-error TS(2322): Type 'string' is not assignable to type 'never'.
                            type: 'spotify',
                            // @ts-expect-error TS(2322): Type 'string' is not assignable to type 'never'.
                            name: 'unnamed',
                            // @ts-expect-error TS(2322): Type 'string' is not assignable to type 'never'.
                            source: 'ENV',
                            // @ts-expect-error TS(2322): Type 'string' is not assignable to type 'never'.
                            mode: 'single',
                            // @ts-expect-error TS(2322): Type '{ accessToken: string | undefined; clientId:... Remove this comment to see the full error message
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
                            // @ts-expect-error TS(2322): Type 'string' is not assignable to type 'never'.
                            type: 'tautulli',
                            // @ts-expect-error TS(2322): Type 'string' is not assignable to type 'never'.
                            name: 'unnamed',
                            // @ts-expect-error TS(2322): Type 'string' is not assignable to type 'never'.
                            source: 'ENV',
                            // @ts-expect-error TS(2322): Type 'string' is not assignable to type 'never'.
                            mode: 'single',
                            // @ts-expect-error TS(2322): Type '{ user: string | undefined; }' is not assign... Remove this comment to see the full error message
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
                            // @ts-expect-error TS(2322): Type 'string' is not assignable to type 'never'.
                            type: 'plex',
                            // @ts-expect-error TS(2322): Type 'string' is not assignable to type 'never'.
                            name: 'unnamed',
                            // @ts-expect-error TS(2322): Type 'string' is not assignable to type 'never'.
                            source: 'ENV',
                            // @ts-expect-error TS(2322): Type 'string' is not assignable to type 'never'.
                            mode: 'single',
                            // @ts-expect-error TS(2322): Type '{ user: string | undefined; }' is not assign... Remove this comment to see the full error message
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
                            // @ts-expect-error TS(2322): Type 'string' is not assignable to type 'never'.
                            type: 'subsonic',
                            // @ts-expect-error TS(2322): Type 'string' is not assignable to type 'never'.
                            name: 'unnamed',
                            // @ts-expect-error TS(2322): Type 'string' is not assignable to type 'never'.
                            source: 'ENV',
                            // @ts-expect-error TS(2322): Type 'string' is not assignable to type 'never'.
                            mode: 'single',
                            // @ts-expect-error TS(2322): Type '{ user: string | undefined; password: string... Remove this comment to see the full error message
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
                            // @ts-expect-error TS(2322): Type 'string' is not assignable to type 'never'.
                            type: 'jellyfin',
                            // @ts-expect-error TS(2322): Type 'string' is not assignable to type 'never'.
                            name: 'unnamed',
                            // @ts-expect-error TS(2322): Type 'string' is not assignable to type 'never'.
                            source: 'ENV',
                            // @ts-expect-error TS(2322): Type 'string' is not assignable to type 'never'.
                            mode: 'single',
                            // @ts-expect-error TS(2322): Type '{ user: string | undefined; server: string |... Remove this comment to see the full error message
                            data: j
                        })
                    }
                    break;
                case 'lastfm':
                    // sane default for lastfm is that user want to scrobble TO it, not FROM it -- this is also existing behavior
                    defaultConfigureAs = 'client';
                    break;
                case 'deezer':
                    const d = {
                        clientId: process.env.DEEZER_APP_ID,
                        clientSecret: process.env.DEEZER_SECRET_KEY,
                        redirectUri: process.env.DEEZER_REDIRECT_URI,
                        accessToken: process.env.DEEZER_ACCESS_TOKEN,
                    };
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
                        // @ts-expect-error TS(2345): Argument of type 'any' is not assignable to parame... Remove this comment to see the full error message
                        configs.push(m);
                    }
                }
            }
        }

        // we have all possible configurations so we'll check they are minimally valid
        const validConfigs = configs.reduce((acc, c) => {
            const isValid = isValidConfigStructure(c, {type: true, data: true});
            if (isValid !== true) {
                // @ts-expect-error TS(2339): Property 'source' does not exist on type 'never'.
                this.logger.error(`Source config from ${c.source} with name [${c.name || 'unnamed'}] of type [${c.type || 'unknown'}] will not be used because it has structural errors: ${isValid.join(' | ')}`);
                return acc;
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
            // @ts-expect-error TS(2571): Object is of type 'unknown'.
            const nameGroupedConfigs = typedConfigs.reduce((acc: any, curr: any) => {
                const {name = 'unnamed'} = curr;
                const {[name]: n = []} = acc;
                return {...acc, [name]: [...n, curr]};
            }, {});
            for (const [name, namedConfigs] of Object.entries(nameGroupedConfigs)) {
                let tempNamedConfigs = namedConfigs;
                // @ts-expect-error TS(2571): Object is of type 'unknown'.
                const hasDups = namedConfigs.length > 1;
                if (hasDups) {
                    // @ts-expect-error TS(2571): Object is of type 'unknown'.
                    const sources = namedConfigs.map((c: any) => `Config object from ${c.source} of type [${c.type}]`);
                    this.logger.warn(`Source configs have naming conflicts -- the following configs have the same name "${name}":\n\n${sources.join('\n')}\n`);
                    if (name === 'unnamed') {
                        this.logger.info('HINT: "unnamed" configs occur when using ENVs, if a multi-user mode config does not have a "name" property, or if a config is built in single-user mode');
                    }
                }
                // @ts-expect-error TS(2571): Object is of type 'unknown'.
                tempNamedConfigs = tempNamedConfigs.map(({name = 'unnamed', ...x}, i) => ({
                    ...x,
                    name: hasDups ? `${name}${i + 1}` : name
                }));
                // @ts-expect-error TS(2571): Object is of type 'unknown'.
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

    addSource = async (clientConfig: any, defaults = {}) => {
        const isValidConfig = isValidConfigStructure(clientConfig, {name: true, data: true, type: true});
        if (isValidConfig !== true) {
            throw new Error(`Config object from ${clientConfig.source || 'unknown'} with name [${clientConfig.name || 'unnamed'}] of type [${clientConfig.type || 'unknown'}] has errors: ${isValidConfig.join(' | ')}`)
        }
        const {type, name, clients = [], data: d = {}} = clientConfig;
        // add defaults
        const data = {...defaults, ...d};
        this.logger.debug(`(${name}) Constructing ${type} source`);
        let newSource;
        switch (type) {
            case 'spotify':
                newSource = new SpotifySource(name, {
                    ...data,
                    localUrl: this.localUrl,
                    configDir: this.configDir
                }, clients);
                break;
            case 'plex':
                newSource = await new PlexSource(name, data, clients);
                break;
            case 'tautulli':
                newSource = await new TautulliSource(name, data, clients);
                break;
            case 'subsonic':
                newSource = new SubsonicSource(name, data, clients);
                break;
            case 'jellyfin':
                newSource = await new JellyfinSource(name, data, clients);
                break;
            case 'lastfm':
                newSource = await new LastfmSource(name, {...data, configDir: this.configDir}, clients);
                break;
            case 'deezer':
                newSource = await new DeezerSource(name, {
                    ...data,
                    localUrl: this.localUrl,
                    configDir: this.configDir
                }, clients);
                break;
            default:
                break;
        }

        if(newSource === undefined) {
            // really shouldn't get here!
            throw new Error(`Source of type ${type} was not recognized??`);
        }
        if(newSource.initialized === false) {
            this.logger.debug(`(${name}) Attempting ${type} initialization...`);
            if ((await newSource.initialize()) === false) {
                this.logger.error(`(${name}) ${type} source failed to initialize. Source needs to be successfully initialized before activity capture can begin.`);
                return;
            } else {
                this.logger.info(`(${name}) ${type} source initialized`);
            }
        } else {
            this.logger.info(`(${name}) ${type} source initialized`);
        }

        if(newSource.requiresAuth && !newSource.authed) {
            this.logger.debug(`(${name}) Checking ${type} source auth...`);
            let success;
            try {
                success = await newSource.testAuth();
            } catch (e) {
                success = false;
            }
            if(!success) {
                this.logger.warn(`(${name}) ${type} source auth failed.`);
            } else {
                this.logger.info(`(${name}) ${type} source auth OK`);
            }
        }

        // @ts-expect-error TS(2345): Argument of type 'SpotifySource | PlexSource | Sub... Remove this comment to see the full error message
        this.sources.push(newSource);
    }
}
