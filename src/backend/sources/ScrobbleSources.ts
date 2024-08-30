/* eslint-disable no-case-declarations */
import { childLogger, Logger } from '@foxxmd/logging';
import EventEmitter from "events";
import { ConfigMeta, InternalConfig, SourceType, sourceTypes } from "../common/infrastructure/Atomic.js";
import { AIOConfig, SourceDefaults } from "../common/infrastructure/config/aioConfig.js";
import { ChromecastSourceConfig } from "../common/infrastructure/config/source/chromecast.js";
import { DeezerData, DeezerSourceConfig } from "../common/infrastructure/config/source/deezer.js";
import {
    JellyApiData,
    JellyApiSourceConfig,
    JellyData,
    JellySourceConfig
} from "../common/infrastructure/config/source/jellyfin.js";
import { JRiverData, JRiverSourceConfig } from "../common/infrastructure/config/source/jriver.js";
import { KodiData, KodiSourceConfig } from "../common/infrastructure/config/source/kodi.js";
import { LastfmSourceConfig } from "../common/infrastructure/config/source/lastfm.js";
import { ListenBrainzSourceConfig } from "../common/infrastructure/config/source/listenbrainz.js";
import { MopidySourceConfig } from "../common/infrastructure/config/source/mopidy.js";
import { MPDSourceConfig } from "../common/infrastructure/config/source/mpd.js";
import { MPRISData, MPRISSourceConfig } from "../common/infrastructure/config/source/mpris.js";
import { MusikcubeData, MusikcubeSourceConfig } from "../common/infrastructure/config/source/musikcube.js";
import { PlexSourceConfig } from "../common/infrastructure/config/source/plex.js";
import { SourceAIOConfig, SourceConfig } from "../common/infrastructure/config/source/sources.js";
import { SpotifySourceConfig, SpotifySourceData } from "../common/infrastructure/config/source/spotify.js";
import { SubsonicData, SubSonicSourceConfig } from "../common/infrastructure/config/source/subsonic.js";
import { TautulliSourceConfig } from "../common/infrastructure/config/source/tautulli.js";
import { VLCData, VLCSourceConfig } from "../common/infrastructure/config/source/vlc.js";
import { WebScrobblerSourceConfig } from "../common/infrastructure/config/source/webscrobbler.js";
import { YTMusicSourceConfig } from "../common/infrastructure/config/source/ytmusic.js";
import * as aioSchema from "../common/schema/aio-source.json";
import * as sourceSchema from "../common/schema/source.json";
import { WildcardEmitter } from "../common/WildcardEmitter.js";
import { parseBool, readJson, validateJson } from "../utils.js";
import AbstractSource from "./AbstractSource.js";
import { ChromecastSource } from "./ChromecastSource.js";
import DeezerSource from "./DeezerSource.js";
import JellyfinApiSource from "./JellyfinApiSource.js";
import JellyfinSource from "./JellyfinSource.js";
import { JRiverSource } from "./JRiverSource.js";
import { KodiSource } from "./KodiSource.js";
import LastfmSource from "./LastfmSource.js";
import ListenbrainzSource from "./ListenbrainzSource.js";
import { MopidySource } from "./MopidySource.js";
import { MPDSource } from "./MPDSource.js";
import { MPRISSource } from "./MPRISSource.js";
import { MusikcubeSource } from "./MusikcubeSource.js";
import PlexSource from "./PlexSource.js";
import SpotifySource from "./SpotifySource.js";
import { SubsonicSource } from "./SubsonicSource.js";
import TautulliSource from "./TautulliSource.js";
import { VLCSource } from "./VLCSource.js";
import { WebScrobblerSource } from "./WebScrobblerSource.js";
import YTMusicSource from "./YTMusicSource.js";

type groupedNamedConfigs = {[key: string]: ParsedConfig[]};

type ParsedConfig = SourceAIOConfig & ConfigMeta;

type InternalConfigOptional = Omit<InternalConfig, 'logger'>

export default class ScrobbleSources {

    sources: AbstractSource[] = [];
    logger: Logger;
    internalConfig: InternalConfig;

    emitter: WildcardEmitter;

    constructor(emitter: EventEmitter, internal: InternalConfigOptional, parentLogger: Logger) {
        this.emitter = emitter;
        this.logger = childLogger(parentLogger, 'Sources'); // winston.loggers.get('app').child({labels: ['Sources']}, mergeArr);
        this.internalConfig = {
            ...internal,
            logger: this.logger
        }
    }

    getByName = (name: any) => this.sources.find(x => x.name === name)

    getByType = (type: any) => this.sources.filter(x => x.type === type)

    getByNameAndType = (name: string, type: SourceType) => this.sources.find(x => x.name === name && x.type === type)

    async getStatusSummary(type?: string, name?: string): Promise<[boolean, string[]]> {
        let sources: AbstractSource[]
        let sourcesReady = true;
        const messages: string[] = [];

        if(type !== undefined) {
            sources = this.getByType(type);
        } else if(name !== undefined) {
            sources = [this.getByName(name)];
        } else {
            sources = this.sources;
        }

        for(const source of sources) {
            if(source.requiresAuth && !source.authed) {
                sourcesReady = false;
                messages.push(`Source ${source.type} - ${source.name} requires authentication.`);
            }
            if(source.canPoll && !source.polling) {
                sourcesReady = false;
                messages.push(`Source ${source.type} - ${source.name} is not polling.`);
            }
        }

        return [sourcesReady, messages];
    }

    buildSourcesFromConfig = async (additionalConfigs: ParsedConfig[] = []) => {
        const configs: ParsedConfig[] = additionalConfigs;

        let configFile;
        try {
            configFile = await readJson(`${this.internalConfig.configDir}/config.json`, {throwOnNotFound: false});
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

        for (const sourceType of sourceTypes) {
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
                        user: process.env.TAUTULLI_USER
                    };
                    if(t.user === undefined) {
                        t.user = process.env.PLEX_USER;
                    }
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
                    const j: (JellyData | JellyApiData) = {
                        users: process.env.JELLYFIN_USER,
                        servers: process.env.JELLYFIN_SERVER,
                        user: process.env.JELLYFIN_USER,
                        password: process.env.JELLYFIN_PASSWORD,
                        apiKey: process.env.JELLYFIN_APIKEY,
                        url: process.env.JELLYFIN_URL,
                        usersAllow: process.env.JELLYFIN_USERS_ALLOWED,
                        devicesAllow: process.env.JELLYFIN_DEVICES_ALLOWED,
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
                        clientId: process.env.DEEZER_CLIENT_ID,
                        clientSecret: process.env.DEEZER_CLIENT_SECRET,
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
                case 'mpris':
                    const shouldUse = parseBool(process.env.MPRIS_ENABLE);
                    const mp = {
                        blacklist: process.env.MPRIS_BLACKLIST,
                        whitelist: process.env.MPRIS_WHITELIST
                    }
                    if (!Object.values(mp).every(x => x === undefined) || shouldUse) {
                        configs.push({
                            type: 'mpris',
                            name: 'unnamed',
                            source: 'ENV',
                            mode: 'single',
                            configureAs: defaultConfigureAs,
                            data: mp as MPRISData
                        });
                    }
                    break;
                case 'listenbrainz':
                    // sane default for lastfm is that user want to scrobble TO it, not FROM it -- this is also existing behavior
                    defaultConfigureAs = 'client';
                    break;
                case 'jriver':
                    const jr = {
                        url: process.env.JRIVER_URL,
                        username: process.env.JRIVER_USER,
                        password: process.env.JRIVER_PASSWORD
                    }
                    if (!Object.values(jr).every(x => x === undefined)) {
                        configs.push({
                            type: 'jriver',
                            name: 'unnamed',
                            source: 'ENV',
                            mode: 'single',
                            configureAs: defaultConfigureAs,
                            data: jr as JRiverData
                        });
                    }
                    break;
                case 'kodi':
                    const ko = {
                        url: process.env.KODI_URL,
                        username: process.env.KODI_USER,
                        password: process.env.KODI_PASSWORD
                    }
                    if (!Object.values(ko).every(x => x === undefined)) {
                        configs.push({
                            type: 'kodi',
                            name: 'unnamed',
                            source: 'ENV',
                            mode: 'single',
                            configureAs: defaultConfigureAs,
                            data: ko as KodiData
                        });
                    }
                    break;
                case 'webscrobbler':
                    const wsShouldUse = parseBool(process.env.WS_ENABLE);
                    const ws = {
                        blacklist: process.env.WS_BLACKLIST,
                        whitelist: process.env.WS_WHITELIST
                    }
                    if (!Object.values(ws).every(x => x === undefined) || wsShouldUse) {
                        configs.push({
                            type: 'webscrobbler',
                            name: 'unnamed',
                            source: 'ENV',
                            mode: 'single',
                            configureAs: defaultConfigureAs,
                            data: {
                                blacklist: ws.blacklist !== undefined ? ws.blacklist.split(',') : [],
                                whitelist: ws.whitelist !== undefined ? ws.whitelist.split(',') : [],
                            }
                        });
                    }
                    break;
                case 'chromecast':
                    const ccShouldUse = parseBool(process.env.CC_ENABLE);
                    const cc = {
                        blacklistDevices: process.env.CC_BLACKLIST_DEVICES,
                        whitelistDevices: process.env.CC_WHITELIST_DEVICES,
                        blacklistApps: process.env.CC_BLACKLIST_APPS,
                        whitelistApps: process.env.CC_WHITELIST_APPS
                    }
                    if (!Object.values(cc).every(x => x === undefined) || ccShouldUse) {
                        configs.push({
                            type: 'chromecast',
                            name: 'unnamed',
                            source: 'ENV',
                            mode: 'single',
                            configureAs: defaultConfigureAs,
                            data: {
                                blacklistDevices: cc.blacklistDevices !== undefined ? cc.blacklistDevices.split(',') : [],
                                whitelistDevices: cc.whitelistDevices !== undefined ? cc.whitelistDevices.split(',') : [],
                                blacklistApps: cc.blacklistApps !== undefined ? cc.blacklistApps.split(',') : [],
                                whitelistApps: cc.whitelistApps !== undefined ? cc.whitelistApps.split(',') : [],
                            }
                        });
                    }
                    break;
                case 'musikcube':
                    const mc = {
                        url: process.env.MC_URL,
                        password: process.env.MC_PASSWORD
                    }
                    if (!Object.values(mc).every(x => x === undefined)) {
                        configs.push({
                            type: 'musikcube',
                            name: 'unnamed',
                            source: 'ENV',
                            mode: 'single',
                            configureAs: defaultConfigureAs,
                            data: mc as MusikcubeData
                        });
                    }
                    break;
                case 'vlc':
                    const vlc = {
                        url: process.env.VLC_URL,
                        password: process.env.VLC_PASSWORD
                    }
                    if (!Object.values(vlc).every(x => x === undefined)) {
                        configs.push({
                            type: 'vlc',
                            name: 'unnamed',
                            source: 'ENV',
                            mode: 'single',
                            configureAs: defaultConfigureAs,
                            data: vlc as VLCData
                        });
                    }
                    break;
                default:
                    break;
            }
            let rawSourceConfigs;
            try {
                rawSourceConfigs = await readJson(`${this.internalConfig.configDir}/${sourceType}.json`, {throwOnNotFound: false});
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

                        // @ts-expect-error will eventually have all info (lazy)
                        const parsedConfig: ParsedConfig = {
                            ...rawConf,
                            source: `${sourceType}.json`,
                            type: sourceType
                        }

                        if(!['lastfm','listenbrainz'].includes(sourceType) || ((validConfig as LastfmSourceConfig | ListenBrainzSourceConfig).configureAs === 'source')) {
                            configs.push(parsedConfig);
                        } else {
                            if('configureAs' in validConfig) {
                                if(validConfig.configureAs === 'source') {
                                    configs.push(parsedConfig);
                                } else {
                                    this.logger.verbose(`${sourceType} has 'configureAs: client' so will skip adding as a source`);
                                }
                            } else {
                                this.logger.verbose(`${sourceType} did not have 'configureAs' specified! Assuming 'client' so will skip adding as a source`);
                            }
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
                        await this.addSource(c, sourceDefaults);
                    } catch(e) {
                        this.logger.error(`Source ${c.name} of type ${c.type} was not added because of unrecoverable errors`);
                        this.logger.error(e);
                    }
                }
            }
        }
    }

    addSource = async (clientConfig: ParsedConfig, defaults: SourceDefaults = {}) => {
        // const isValidConfig = isValidConfigStructure(clientConfig, {name: true, data: true, type: true});
        // if (isValidConfig !== true) {
        //     throw new Error(`Config object from ${clientConfig.source || 'unknown'} with name [${clientConfig.name || 'unnamed'}] of type [${clientConfig.type || 'unknown'}] has errors: ${isValidConfig.join(' | ')}`)
        // }

        const {type, name, data: d = {}, enable = true, options: clientOptions = {}} = clientConfig;

        if(enable === false) {
            this.logger.warn(`${type} (${name}) source was disabled by config`);
            return;
        }
        
        // add defaults
        const compositeConfig: SourceConfig = {...clientConfig, data: d, options: {...defaults, ...clientOptions}};

        this.logger.debug(`(${name}) Constructing ${type} source`);
        let newSource: AbstractSource;
        switch (type) {
            case 'spotify':
                newSource = new SpotifySource(name, compositeConfig as SpotifySourceConfig, this.internalConfig, this.emitter);
                break;
            case 'plex':
                newSource = await new PlexSource(name, compositeConfig as PlexSourceConfig, this.internalConfig, 'plex', this.emitter);
                break;
            case 'tautulli':
                newSource = await new TautulliSource(name, compositeConfig as TautulliSourceConfig, this.internalConfig, this.emitter);
                break;
            case 'subsonic':
                newSource = new SubsonicSource(name, compositeConfig as SubSonicSourceConfig, this.internalConfig, this.emitter);
                break;
            case 'jellyfin':
                const jfConfig = compositeConfig as (JellySourceConfig | JellyApiSourceConfig);
                if(jfConfig.data.user !== undefined) {
                    newSource = await new JellyfinApiSource(name, compositeConfig as JellyApiSourceConfig, this.internalConfig, this.emitter);
                } else {
                    newSource = await new JellyfinSource(name, compositeConfig as JellySourceConfig, this.internalConfig, this.emitter);
                }
                break;
            case 'lastfm':
                newSource = await new LastfmSource(name, compositeConfig as LastfmSourceConfig, this.internalConfig, this.emitter);
                break;
            case 'deezer':
                newSource = await new DeezerSource(name, compositeConfig as DeezerSourceConfig, this.internalConfig, this.emitter);
                break;
            case 'ytmusic':
                newSource = await new YTMusicSource(name, compositeConfig as YTMusicSourceConfig, this.internalConfig, this.emitter);
                break;
            case 'mpris':
                newSource = await new MPRISSource(name, compositeConfig as MPRISSourceConfig, this.internalConfig, this.emitter);
                break;
            case 'mopidy':
                newSource = await new MopidySource(name, compositeConfig as MopidySourceConfig, this.internalConfig, this.emitter);
                break;
            case 'listenbrainz':
                newSource = await new ListenbrainzSource(name, compositeConfig as ListenBrainzSourceConfig, this.internalConfig, this.emitter);
                break;
            case 'jriver':
                newSource = await new JRiverSource(name, compositeConfig as JRiverSourceConfig, this.internalConfig, this.emitter);
                break;
            case 'kodi':
                newSource = await new KodiSource(name, compositeConfig as KodiSourceConfig, this.internalConfig, this.emitter);
                break;
            case 'webscrobbler':
                newSource = await new WebScrobblerSource(name, compositeConfig as WebScrobblerSourceConfig, this.internalConfig, this.emitter);
                break;
            case 'chromecast':
                newSource = await new ChromecastSource(name, compositeConfig as ChromecastSourceConfig, this.internalConfig, this.emitter);
                break;
            case 'musikcube':
                newSource = await new MusikcubeSource(name, compositeConfig as MusikcubeSourceConfig, this.internalConfig, this.emitter);
                break;
            case 'mpd':
                newSource = await new MPDSource(name, compositeConfig as MPDSourceConfig, this.internalConfig, this.emitter);
                break;
            case 'vlc':
                newSource = await new VLCSource(name, compositeConfig as VLCSourceConfig, this.internalConfig, this.emitter);
                break;
            default:
                break;
        }

        if(newSource === undefined) {
            // really shouldn't get here!
            this.logger.error(new Error(`Source of type ${type} was not recognized??`));
            return;
        }
        this.sources.push(newSource);
        if(!newSource.isReady()) {
            if ((await newSource.initialize()) === false) {
                this.logger.error(`${type} (${name}) source failed to initialize. Source needs to be successfully initialized before activity capture can begin.`);
            }
        } else {
            newSource.logger.info('Fully Initialized!');
        }
    }
}
