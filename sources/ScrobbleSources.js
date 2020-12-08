import {createLabelledLogger, isValidConfigStructure, readJson} from "../utils.js";
import SpotifySource from "./SpotifySource.js";
import PlexSource from "./PlexSource.js";
import TautulliSource from "./TautulliSource.js";
import {SubsonicSource} from "./SubsonicSource.js";

export default class ScrobbleSources {

    sources = [];
    logger;
    configDir;
    localUrl;

    sourceTypes = ['spotify', 'plex', 'tautulli', 'subsonic'];

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

    buildSourcesFromConfig = async (additionalConfigs = []) => {
        let configs = additionalConfigs;

        let configFile;
        try {
            configFile = await readJson(`${this.configDir}/config.json`, {throwOnNotFound: false});
        } catch (e) {
            throw new Error('config.json could not be parsed');
        }
        if (configFile !== undefined) {
            const {sources: mainConfigSourcesConfigs = []} = configFile;
            if (!mainConfigSourcesConfigs.every(x => x !== null && typeof x === 'object')) {
                throw new Error('All sources from config.json must be objects');
            }
            for (const c of mainConfigSourcesConfigs) {
                const {name = 'unnamed'} = c;
                configs.push({...c, name, source: 'config.json'});
            }
        }

        for (let sourceType of this.sourceTypes) {
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
                default:
                    break;
            }
            let rawSourceConfigs;
            try {
                rawSourceConfigs = await readJson(`${this.configDir}/${sourceType}.json`, {throwOnNotFound: false});
            } catch (e) {
                throw new Error(`${sourceType}.json config file could not be parsed`);
            }
            if (rawSourceConfigs !== undefined) {
                let sourceConfigs = [];
                if (Array.isArray(rawSourceConfigs)) {
                    sourceConfigs = rawSourceConfigs;
                } else if (rawSourceConfigs === null || typeof rawSourceConfigs === 'object') {
                    // backwards compatibility, assuming its single-user mode
                    if (rawSourceConfigs.data === undefined) {
                        sourceConfigs = [{data: rawSourceConfigs, mode: 'single', name: 'unnamed'}];
                    } else {
                        sourceConfigs = [rawSourceConfigs];
                    }
                } else {
                    throw new Error(`All top level data from ${sourceType}.json must be an object or array of objects`);
                }
                for (const m of sourceConfigs) {
                    if (m === null || typeof m !== 'object') {
                        throw new Error(`All top-level data from ${sourceType}.json must be an object or array of objects`);
                    }
                    m.source = `${sourceType}.json`;
                    m.type = sourceType;
                    configs.push(m);
                }
            }
        }

        // we have all possible configurations so we'll check they are minimally valid
        const configErrors = configs.reduce((acc, c) => {
            const isValid = isValidConfigStructure(c, {type: true, data: true});
            if (isValid !== true) {
                const msg = `Source config from ${c.source} with name [${c.name || 'unnamed'}] of type [${c.type || 'unknown'}] has errors: ${isValid.join(' | ')}`;
                return acc.concat(msg);
            }
            return acc;
        }, []);
        if (configErrors.length > 0) {
            for (const m of configErrors) {
                this.logger.error(m);
            }
            throw new Error('Could not build sources due to above errors');
        }

        // finally! all configs are valid, structurally, and can now be passed to addClient
        // do a last check that names (within each type) are unique and warn if not, but add anyways
        const typeGroupedConfigs = configs.reduce((acc, curr) => {
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
                tempNamedConfigs = tempNamedConfigs.map(({name = 'unnamed', ...x},i) => ({...x, name: hasDups ? `${name}${i+1}` : name}));
                for(const c of tempNamedConfigs) {
                    await this.addSource(c);
                }
            }
        }
    }

    addSource = async (clientConfig) => {
        const isValidConfig = isValidConfigStructure(clientConfig, {name: true, data: true, type: true});
        if (isValidConfig !== true) {
            throw new Error(`Config object from ${clientConfig.source || 'unknown'} with name [${clientConfig.name || 'unnamed'}] of type [${clientConfig.type || 'unknown'}] has errors: ${isValidConfig.join(' | ')}`)
        }
        const {type, name, clients = [], data = {}} = clientConfig;
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
                this.logger.debug(`(${name}) Initializing Subsonic source`);
                const ssSource = new SubsonicSource(name, data, clients);
                await ssSource.testConnection();
                this.logger.info(`(${name}) Subsonic source initialized`);
                this.sources.push(ssSource);
                break;
            default:
                break;
        }
    }
}
