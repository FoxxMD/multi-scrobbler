import {createLabelledLogger, readJson, validateJson} from "../utils.js";
import SpotifySource from "./SpotifySource.js";
import PlexSource from "./PlexSource.js";
import TautulliSource from "./TautulliSource.js";
import {SubsonicSource} from "./SubsonicSource.js";
import JellyfinSource from "./JellyfinSource.js";
import LastfmSource from "./LastfmSource.js";
import DeezerSource from "./DeezerSource.js";
import {ConfigMeta, InternalConfig, SourceType, sourceTypes} from "../common/infrastructure/Atomic.js";
import {configDir as defaultConfigDir} from "../common/index.js";
import {Logger} from "winston";
import {SourceAIOConfig, SourceConfig} from "../common/infrastructure/config/source/sources.js";
import {DeezerData, DeezerSourceConfig} from "../common/infrastructure/config/source/deezer.js";
import {LastfmClientConfig} from "../common/infrastructure/config/client/lastfm.js";
import {JellyData, JellySourceConfig} from "../common/infrastructure/config/source/jellyfin.js";
import {SubsonicData, SubSonicSourceConfig} from "../common/infrastructure/config/source/subsonic.js";
import {TautulliSourceConfig} from "../common/infrastructure/config/source/tautulli.js";
import {PlexSourceConfig} from "../common/infrastructure/config/source/plex.js";
import {SpotifySourceConfig, SpotifySourceData} from "../common/infrastructure/config/source/spotify.js";
import AbstractSource from "./AbstractSource.js";
import {AIOConfig} from "../common/infrastructure/config/aioConfig.js";
import * as aioSchema from "../common/schema/aio-source.json";
import * as sourceSchema from "../common/schema/source.json";
import {LastfmSourceConfig} from "../common/infrastructure/config/source/lastfm.js";
import YTMusicSource from "./YTMusicSource.js";
import {YTMusicSourceConfig} from "../common/infrastructure/config/source/ytmusic.js";
import {Notifiers} from "../notifier/Notifiers.js";

type groupedNamedConfigs = {[key: string]: ParsedConfig[]};

type ParsedConfig = SourceAIOConfig & ConfigMeta;

export default class ScrobbleSources {

    sources: AbstractSource[] = [];
    logger: Logger;
    configDir: string;
    localUrl: string;

    constructor(localUrl: string, configDir: string = defaultConfigDir) {
        this.configDir = configDir;
        this.localUrl = localUrl;
        this.logger = createLabelledLogger('sources', 'Sources');
    }

    getByName = (name: any) => {
        return this.sources.find(x => x.name === name);
    }

    getByType = (type: any) => {
        return this.sources.filter(x => x.type === type);
    }

    getByNameAndType = (name: string, type: SourceType) => {
        return this.sources.find(x => x.name === name && x.type === type);
    }

    buildSourcesFromConfig = async (additionalConfigs: ParsedConfig[] = [], notifier: Notifiers) => {
        let configs: ParsedConfig[] = additionalConfigs;

        let configFile;
        try {
            configFile = await readJson(`${this.configDir}/config.json`, {throwOnNotFound: false});
        } catch (e) {
            throw new Error('config.json could not be parsed');
        }
        let sourceDefaults = {};
        if (configFile !== undefined) {
            const aioConfig = validateJson<AIOConfig>(configFile, aioSchema, this.logger);
            const {
                sources: mainConfigSourcesConfigs = [],
                sourceDefaults: sd = {},
            } = aioConfig;
            sourceDefaults = sd;
/*            const validMainConfigs = mainConfigSourcesConfigs.reduce((acc: any, curr: any, i: any) => {
                if(curr === null) {
                    this.logger.error(`The source config entry at index ${i} in config.json is null but should be an object, will not parse`);
                    return acc;
                }
                if(typeof curr !== 'object') {
                    this.logger.error(`The source config entry at index ${i} in config.json should be an object, will not parse`);
                    return acc;
                }
                return acc.concat(curr);
            }, []);*/
            for (const c of mainConfigSourcesConfigs) {
                const {name = 'unnamed'} = c;
                configs.push({...c,
                    name,
                    source: 'config.json',
                    configureAs: 'source' // override user value
                });
            }
        }

        for (let sourceType of sourceTypes) {
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
                    if (!Object.values(s).every(x => x === undefined && x !== null)) {
                        configs.push({
                            type: 'spotify',
                            name: 'unnamed',
                            source: 'ENV',
                            mode: 'single',
                            configureAs: defaultConfigureAs,
                            data: s as SpotifySourceData
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
                            configureAs: defaultConfigureAs,
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
                            configureAs: defaultConfigureAs,
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
                            configureAs: defaultConfigureAs,
                            data: sub as SubsonicData
                        })
                    }
                    break;
                case 'jellyfin':
                    const j: JellyData = {
                        users: process.env.JELLYFIN_USER,
                        servers: process.env.JELLYFIN_SERVER,
                    };
                    if (!Object.values(j).every(x => x === undefined)) {
                        configs.push({
                            type: 'jellyfin',
                            name: 'unnamed',
                            source: 'ENV',
                            mode: 'single',
                            configureAs: defaultConfigureAs,
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
                    if (!Object.values(d).every(x => x === undefined)) {
                        configs.push({
                            type: 'deezer',
                            name: 'unnamed',
                            source: 'ENV',
                            mode: 'single',
                            configureAs: defaultConfigureAs,
                            data: d as DeezerData
                        });
                    }
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
                let sourceConfigs: ParsedConfig[] = [];
                if (Array.isArray(rawSourceConfigs)) {
                    sourceConfigs = rawSourceConfigs;
                } else if (rawSourceConfigs === null) {
                    this.logger.error(`${sourceType}.json contained no data`);
                    continue;
                } else if (typeof rawSourceConfigs === 'object') {
                    sourceConfigs = [rawSourceConfigs];
                } else {
                    this.logger.error(`All top level data from ${sourceType}.json must be an object or an array of objects, will not parse configs from file`);
                    continue;
                }
                for (const [i,rawConf] of sourceConfigs.entries()) {
                    try {
                        const validConfig = validateJson<SourceConfig>(rawConf, sourceSchema, this.logger);

                        if(sourceType !== 'lastfm' || ((validConfig as LastfmSourceConfig).configureAs === 'source')) {
                            // @ts-ignore
                            const parsedConfig: ParsedConfig = {
                                ...rawConf,
                                source: `${sourceType}.json`,
                                type: sourceType
                            }
                            configs.push(parsedConfig);
                        }
                    } catch (e: any) {
                        this.logger.error(`The config entry at index ${i} from ${sourceType}.json was not valid`);
                    }
                }
            }
        }

        // we have all possible configurations so we'll check they are minimally valid
/*        const validConfigs = configs.reduce((acc, c) => {
            const isValid = isValidConfigStructure(c, {type: true, data: true});
            if (isValid !== true) {
                // @ts-expect-error TS(2339): Property 'source' does not exist on type 'never'.
                this.logger.error(`Source config from ${c.source} with name [${c.name || 'unnamed'}] of type [${c.type || 'unknown'}] will not be used because it has structural errors: ${isValid.join(' | ')}`);
                return acc;
            }
            return acc.concat(c);
        }, []);*/

        // finally! all configs are valid, structurally, and can now be passed to addClient
        // do a last check that names (within each type) are unique and warn if not, but add anyways
        const typeGroupedConfigs = configs.reduce((acc: groupedNamedConfigs, curr: ParsedConfig) => {
            const {type} = curr;
            const {[type]: t = []} = acc;
            return {...acc, [type]: [...t, curr]};
        }, {});
        // only need to warn if dup names PER TYPE
        for (const [type, typedConfigs] of Object.entries(typeGroupedConfigs)) {
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
                        await this.addSource(c, sourceDefaults, notifier);
                    } catch(e) {
                        this.logger.error(`Source ${c.name} of type ${c.type} was not added because of unrecoverable errors`);
                        this.logger.error(e);
                    }
                }
            }
        }
    }

    addSource = async (clientConfig: any, defaults = {}, notifier: Notifiers) => {
        // const isValidConfig = isValidConfigStructure(clientConfig, {name: true, data: true, type: true});
        // if (isValidConfig !== true) {
        //     throw new Error(`Config object from ${clientConfig.source || 'unknown'} with name [${clientConfig.name || 'unnamed'}] of type [${clientConfig.type || 'unknown'}] has errors: ${isValidConfig.join(' | ')}`)
        // }

        const internal: InternalConfig = {
            localUrl: this.localUrl,
            configDir: this.configDir
        };

        const {type, name, data: d = {}} = clientConfig;

        // add defaults
        const data = {...defaults, ...d};
        const compositeConfig: SourceConfig = {...clientConfig, data};

        this.logger.debug(`(${name}) Constructing ${type} source`);
        let newSource;
        switch (type) {
            case 'spotify':
                newSource = new SpotifySource(name, compositeConfig as SpotifySourceConfig, internal, notifier);
                break;
            case 'plex':
                newSource = await new PlexSource(name, compositeConfig as PlexSourceConfig, internal, 'plex', notifier);
                break;
            case 'tautulli':
                newSource = await new TautulliSource(name, compositeConfig as TautulliSourceConfig, internal, notifier);
                break;
            case 'subsonic':
                newSource = new SubsonicSource(name, compositeConfig as SubSonicSourceConfig, internal, notifier);
                break;
            case 'jellyfin':
                newSource = await new JellyfinSource(name, compositeConfig as JellySourceConfig, internal, notifier);
                break;
            case 'lastfm':
                newSource = await new LastfmSource(name, compositeConfig as LastfmClientConfig, internal, notifier);
                break;
            case 'deezer':
                newSource = await new DeezerSource(name, compositeConfig as DeezerSourceConfig, internal, notifier);
                break;
            case 'ytmusic':
                newSource = await new YTMusicSource(name, compositeConfig as YTMusicSourceConfig, internal, notifier);
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

        this.sources.push(newSource);
    }
}
