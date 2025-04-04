/* eslint-disable no-case-declarations */
import { childLogger, Logger } from '@foxxmd/logging';
import EventEmitter from "events";
import { ConfigMeta, InternalConfig, isSourceType, SourceType, sourceTypes } from "../common/infrastructure/Atomic.ts";
import { AIOConfig, SourceDefaults } from "../common/infrastructure/config/aioConfig.ts";
import { AzuracastData, AzuracastSourceConfig } from "../common/infrastructure/config/source/azuracast.ts";
import { ChromecastSourceConfig } from "../common/infrastructure/config/source/chromecast.ts";
import { DeezerData, DeezerSourceConfig } from "../common/infrastructure/config/source/deezer.ts";
import { ListenbrainzEndpointSourceConfig, ListenbrainzEndpointData } from "../common/infrastructure/config/source/endpointlz.ts";
import { LastFMEndpointSourceConfig, LastFMEndpointData } from "../common/infrastructure/config/source/endpointlfm.ts";
import {
    JellyApiData,
    JellyApiSourceConfig,
    JellyData,
    JellySourceConfig
} from "../common/infrastructure/config/source/jellyfin.ts";
import { JRiverData, JRiverSourceConfig } from "../common/infrastructure/config/source/jriver.ts";
import { KodiData, KodiSourceConfig } from "../common/infrastructure/config/source/kodi.ts";
import { LastfmSourceConfig } from "../common/infrastructure/config/source/lastfm.ts";
import { ListenBrainzSourceConfig } from "../common/infrastructure/config/source/listenbrainz.ts";
import { MopidySourceConfig } from "../common/infrastructure/config/source/mopidy.ts";
import { MusicCastData, MusicCastSourceConfig } from "../common/infrastructure/config/source/musiccast.ts";
import { IcecastData, IcecastSourceConfig } from "../common/infrastructure/config/source/icecast.ts";
import { MPDSourceConfig } from "../common/infrastructure/config/source/mpd.ts";
import { MPRISData, MPRISSourceConfig } from "../common/infrastructure/config/source/mpris.ts";
import { MusikcubeData, MusikcubeSourceConfig } from "../common/infrastructure/config/source/musikcube.ts";
import { PlexApiSourceConfig, PlexCompatConfig, PlexSourceConfig } from "../common/infrastructure/config/source/plex.ts";
import { SourceAIOConfig, SourceConfig } from "../common/infrastructure/config/source/sources.ts";
import { SpotifySourceConfig, SpotifySourceData } from "../common/infrastructure/config/source/spotify.ts";
import { SubsonicData, SubSonicSourceConfig } from "../common/infrastructure/config/source/subsonic.ts";
import { TautulliSourceConfig } from "../common/infrastructure/config/source/tautulli.ts";
import { VLCData, VLCSourceConfig } from "../common/infrastructure/config/source/vlc.ts";
import { WebScrobblerSourceConfig } from "../common/infrastructure/config/source/webscrobbler.ts";
import { YTMusicData, YTMusicSourceConfig } from "../common/infrastructure/config/source/ytmusic.ts";
import { WildcardEmitter } from "../common/WildcardEmitter.ts";
import { parseBool, readJson } from "../utils.ts";
import { validateJson } from "../utils/ValidationUtils.ts";
import AbstractSource from "./AbstractSource.ts";
import { AzuracastSource } from "./AzuracastSource.ts";
import { ChromecastSource } from "./ChromecastSource.ts";
import DeezerSource from "./DeezerSource.ts";
import { EndpointListenbrainzSource } from "./EndpointListenbrainzSource.ts";
import { EndpointLastfmSource } from "./EndpointLastfmSource.ts";
import JellyfinApiSource from "./JellyfinApiSource.ts";
import JellyfinSource from "./JellyfinSource.ts";
import { JRiverSource } from "./JRiverSource.ts";
import { KodiSource } from "./KodiSource.ts";
import LastfmSource from "./LastfmSource.ts";
import ListenbrainzSource from "./ListenbrainzSource.ts";
import { MopidySource } from "./MopidySource.ts";
import { MPDSource } from "./MPDSource.ts";
import { MPRISSource } from "./MPRISSource.ts";
import { MusikcubeSource } from "./MusikcubeSource.ts";
import { MusicCastSource } from "./MusicCastSource.ts";
import PlexSource from "./PlexSource.ts";
import SpotifySource from "./SpotifySource.ts";
import { SubsonicSource } from "./SubsonicSource.ts";
import TautulliSource from "./TautulliSource.ts";
import { VLCSource } from "./VLCSource.ts";
import { WebScrobblerSource } from "./WebScrobblerSource.ts";
import YTMusicSource from "./YTMusicSource.ts";
import { Definition } from 'ts-json-schema-generator';
import { getTypeSchemaFromConfigGenerator } from '../utils/SchemaUtils.ts';
import PlexApiSource from './PlexApiSource.ts';
import { nonEmptyStringOrDefault } from '../../core/StringUtils.ts';
import { IcecastSource } from './IcecastSource.ts';

type groupedNamedConfigs = {[key: string]: ParsedConfig[]};

type ParsedConfig = SourceAIOConfig & ConfigMeta;

type InternalConfigOptional = Omit<InternalConfig, 'logger'>

export default class ScrobbleSources {

    sources: AbstractSource[] = [];
    logger: Logger;
    internalConfig: InternalConfig;

    private schemaDefinitions: Record<string, Definition> = {};

    emitter: WildcardEmitter;

    constructor(emitter: EventEmitter, internal: InternalConfigOptional, parentLogger: Logger) {
        this.emitter = emitter;
        this.logger = childLogger(parentLogger, 'Sources');
        this.internalConfig = {
            ...internal,
            logger: this.logger
        }
    }

    getByName = (name: any) => this.sources.find(x => x.name === name)

    getByType = (type: any) => this.sources.filter(x => x.type === type)

    getByNameAndType = (name: string, type: SourceType) => this.sources.find(x => x.name === name && x.type === type)

    async getStatusSummary(type?: string, name?: string): Promise<[boolean, string[]]> {
        let sources: AbstractSource[] = [];
        let sourcesReady = true;
        const messages: string[] = [];

        if(type !== undefined) {
            sources = this.getByType(type);
        } else if(name !== undefined) {
            const sourceByName = this.getByName(name);
            if(sourceByName !== undefined) {
                sources = [sourceByName];
            }
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

    private getSchemaByType = (type: SourceType): Definition => {
        if(this.schemaDefinitions[type] === undefined) {
            switch(type) {
                case 'spotify':
                    this.schemaDefinitions[type] = getTypeSchemaFromConfigGenerator("SpotifySourceConfig");
                    break;
                case 'plex':
                    this.schemaDefinitions[type] = getTypeSchemaFromConfigGenerator("PlexCompatConfig");
                    break;
                case 'tautulli':
                    this.schemaDefinitions[type] = getTypeSchemaFromConfigGenerator("TautulliSourceConfig");
                    break;
                case 'deezer':
                    this.schemaDefinitions[type] = getTypeSchemaFromConfigGenerator("DeezerSourceConfig");
                    break;
                case 'endpointlz':
                    this.schemaDefinitions[type] = getTypeSchemaFromConfigGenerator("ListenbrainzEndpointSourceConfig");
                    break;
                case 'endpointlfm':
                    this.schemaDefinitions[type] = getTypeSchemaFromConfigGenerator("LastFMEndpointSourceConfig");
                    break;
                case 'icecast':
                    this.schemaDefinitions[type] = getTypeSchemaFromConfigGenerator("IcecastSourceConfig");
                    break;
                case 'subsonic':
                    this.schemaDefinitions[type] = getTypeSchemaFromConfigGenerator("SubSonicSourceConfig");
                    break;
                case 'jellyfin':
                    this.schemaDefinitions[type] = getTypeSchemaFromConfigGenerator("JellyfinCompatConfig");
                    break;
                case 'lastfm':
                    this.schemaDefinitions[type] = getTypeSchemaFromConfigGenerator("LastfmSourceConfig");
                    break;
                case 'ytmusic':
                    this.schemaDefinitions[type] = getTypeSchemaFromConfigGenerator("YTMusicSourceConfig");
                    break;
                case 'mpris':
                    this.schemaDefinitions[type] = getTypeSchemaFromConfigGenerator("MPRISSourceConfig");
                    break;
                case 'mopidy':
                    this.schemaDefinitions[type] = getTypeSchemaFromConfigGenerator("MopidySourceConfig");
                    break;
                case 'listenbrainz':
                    this.schemaDefinitions[type] = getTypeSchemaFromConfigGenerator("ListenBrainzSourceConfig");
                    break;
                case 'jriver':
                    this.schemaDefinitions[type] = getTypeSchemaFromConfigGenerator("JRiverSourceConfig");
                    break;
                case 'kodi':
                    this.schemaDefinitions[type] = getTypeSchemaFromConfigGenerator("KodiSourceConfig");
                    break;
                case 'chromecast':
                    this.schemaDefinitions[type] = getTypeSchemaFromConfigGenerator("ChromecastSourceConfig");
                    break;
                case 'webscrobbler':
                    this.schemaDefinitions[type] = getTypeSchemaFromConfigGenerator("WebScrobblerSourceConfig");
                    break;
                case 'musikcube':
                    this.schemaDefinitions[type] = getTypeSchemaFromConfigGenerator("MusikcubeSourceConfig");
                    break;
                case 'musiccast':
                    this.schemaDefinitions[type] = getTypeSchemaFromConfigGenerator("MusicCastSourceConfig");
                    break;
                case 'mpd':
                    this.schemaDefinitions[type] = getTypeSchemaFromConfigGenerator("MPDSourceConfig");
                    break;
                case 'vlc':
                    this.schemaDefinitions[type] = getTypeSchemaFromConfigGenerator("VLCSourceConfig");
                    break;
                case 'azuracast':
                    this.schemaDefinitions[type] = getTypeSchemaFromConfigGenerator("AzuracastSourceConfig");
                    break;
            }
        }
        return this.schemaDefinitions[type];
    }

    buildSourceDefaults = (fileDefaults: SourceDefaults = {}): SourceDefaults => {
        const scrobbleDurationEnv = process.env.SOURCE_SCROBBLE_DURATION;
        const scrobblePercentEnv = process.env.SOURCE_SCROBBLE_PERCENT;

        const buildDefaults = {...fileDefaults};

        if(nonEmptyStringOrDefault(scrobbleDurationEnv) !== undefined || nonEmptyStringOrDefault(scrobblePercentEnv) !== undefined) {
            const {
                scrobbleThresholds: {
                    duration,
                    percent
                } = {},
                scrobbleThresholds = {}
            } = fileDefaults;
            buildDefaults.scrobbleThresholds = {...scrobbleThresholds};

            if(duration === undefined && nonEmptyStringOrDefault(scrobbleDurationEnv) !== undefined) {
                const envDur = Number.parseInt(scrobbleDurationEnv);
                if(Number.isNaN(envDur)) {
                    this.logger.warn(`Ignoring value '${scrobbleDurationEnv}' for env SOURCE_SCROBBLE_DURATION because it is not a number`);
                } else {
                    buildDefaults.scrobbleThresholds.duration = envDur;
                    this.logger.verbose(`Set default scrobble threshold duration to '${scrobbleDurationEnv}' based on env SOURCE_SCROBBLE_DURATION`);
                }
            }
            if(percent === undefined && nonEmptyStringOrDefault(scrobblePercentEnv) !== undefined) {
                const envPercent = Number.parseInt(scrobblePercentEnv);
                if(Number.isNaN(envPercent)) {
                    this.logger.warn(`Ignoring value '${scrobblePercentEnv}' for env SOURCE_SCROBBLE_PERCENT because it is not a number`);
                } else {
                    buildDefaults.scrobbleThresholds.percent = envPercent;
                    this.logger.verbose(`Set default scrobble threshold percent to '${scrobblePercentEnv}' based on env SOURCE_SCROBBLE_PERCENT`);
                }
            }
        }

        return buildDefaults;
    }

    buildSourcesFromConfig = async (additionalConfigs: ParsedConfig[] = []) => {
        const configs: ParsedConfig[] = additionalConfigs;

        let configFile;
        try {
            configFile = await readJson(`${this.internalConfig.configDir}/config.json`, {throwOnNotFound: false});
        } catch (e) {
            throw new Error('config.json could not be parsed');
        }

        const relaxedSchema = getTypeSchemaFromConfigGenerator("AIOSourceRelaxedConfig");

        let sourceDefaults = {};
        if (configFile !== undefined) {
            const aioConfig = validateJson<AIOConfig>(configFile, relaxedSchema, this.logger);
            const {
                sources: mainConfigSourcesConfigs = [],
                sourceDefaults: sd = {},
            } = aioConfig;
            sourceDefaults = this.buildSourceDefaults(sd);
            for (const [index, c] of mainConfigSourcesConfigs.entries()) {
                const {name = 'unnamed'} = c;
                if(!isSourceType(c.type.toLocaleLowerCase())) {
                    const invalidMsgType = `Source config ${index + 1} (${name}) in config.json has an invalid source type of '${c.type}'. Must be one of ${sourceTypes.join(' | ')}`;
                    this.emitter.emit('error', new Error(invalidMsgType));
                    this.logger.error(invalidMsgType);
                    continue;
                }
                if(['lastfm','listenbrainz'].includes(c.type.toLocaleLowerCase()) && ((c as LastfmSourceConfig | ListenBrainzSourceConfig).configureAs !== 'source')) 
                {
                   this.logger.debug(`Skipping config ${index + 1} (${name}) in config.json because it is configured as a client.`);
                   continue;
                }
                try {
                    validateJson<SourceConfig>(c, this.getSchemaByType(c.type.toLocaleLowerCase() as SourceType), this.logger);
                } catch (e) {
                    const err = new Error(`Source config ${index + 1} (${c.type} - ${name}) in config.json is invalid and will not be used.`, {cause: e});
                    this.emitter.emit('error', err);
                    this.logger.error(err);
                    continue;
                }
                configs.push({...c,
                    name,
                    source: 'config.json',
                    configureAs: 'source' // override user value
                });
            }
        } else {
            sourceDefaults = this.buildSourceDefaults();
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
                        user: process.env.PLEX_USER,
                        url: process.env.PLEX_URL,
                        token: process.env.PLEX_TOKEN,
                        usersAllow: process.env.PLEX_USERS_ALLOW,
                        usersBlock: process.env.PLEX_USERS_BLOCK,
                        devicesAllow: process.env.PLEX_DEVICES_ALLOW,
                        deviceBlock: process.env.PLEX_DEVICES_BLOCK,
                        librariesAllow: process.env.PLEX_LIBRARIES_ALLOW,
                        librariesBlock: process.env.PLEX_LIBRARIES_BLOCK
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
                        usersAllow: process.env.JELLYFIN_USERS_ALLOW,
                        usersBlock: process.env.JELLYFIN_USERS_BLOCK,
                        devicesAllow: process.env.JELLYFIN_DEVICES_ALLOW,
                        deviceBlock: process.env.JELLYFIN_DEVICES_BLOCK,
                        librariesAllow: process.env.JELLYFIN_LIBRARIES_ALLOW,
                        librariesBlock: process.env.JELLYFIN_LIBRARIES_BLOCK
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
                case 'endpointlz':
                    const lzShouldUse = parseBool(process.env.LZENDPOINT_ENABLE);
                    const lze = {
                        slug: process.env.LZE_SLUG,
                        token: process.env.LZE_TOKEN
                    }
                    if (!Object.values(lze).every(x => x === undefined) || lzShouldUse) {
                        configs.push({
                            type: 'endpointlz',
                            name: 'unnamed',
                            source: 'ENV',
                            mode: 'single',
                            configureAs: defaultConfigureAs,
                            data: lze as ListenbrainzEndpointData
                        });
                    }
                    break;
                case 'endpointlfm':
                    const lfmShouldUse = parseBool(process.env.LFMENDPOINT_ENABLE);
                    const lfme = {
                        slug: process.env.LFM_SLUG,
                    }
                    if (!Object.values(lfme).every(x => x === undefined) || lfmShouldUse) {
                        configs.push({
                            type: 'endpointlfm',
                            name: 'unnamed',
                            source: 'ENV',
                            mode: 'single',
                            configureAs: defaultConfigureAs,
                            data: lfme as LastFMEndpointData
                        });
                    }
                    break;
                case 'icecast':
                    const icecast = {
                        url: process.env.ICECAST_URL,
                        scrobbleOnStart: process.env.ICECAST_SCROBBLE_START,
                    }
                    if (!Object.values(icecast).every(x => x === undefined)) {
                        configs.push({
                            type: 'icecast',
                            name: 'unnamed',
                            source: 'ENV',
                            mode: 'single',
                            configureAs: defaultConfigureAs,
                            data: icecast as IcecastData,
                            options: {
                                systemScrobble: parseBool(icecast.scrobbleOnStart)
                            }
                        });
                    }
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
                case 'musiccast':
                    const musecase = {
                        url: process.env.MCAST_URL,
                    }
                    if (!Object.values(musecase).every(x => x === undefined)) {
                        configs.push({
                            type: 'musiccast',
                            name: 'unnamed',
                            source: 'ENV',
                            mode: 'single',
                            configureAs: defaultConfigureAs,
                            data: musecase as MusicCastData
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
                case 'ytmusic':
                    const ytm = {
                        redirectUri: process.env.YTM_REDIRECT_URI,
                        clientId: process.env.YTM_CLIENT_ID,
                        clientSecret: process.env.YTM_CLIENT_SECRET,
                        cookie: process.env.YTM_COOKIE
                    }
                    if (!Object.values(ytm).every(x => x === undefined)) {
                        configs.push({
                            type: 'ytmusic',
                            name: 'unnamed',
                            source: 'ENV',
                            mode: 'single',
                            configureAs: defaultConfigureAs,
                            data: ytm as YTMusicData
                        });
                    }
                    break;
                case 'azuracast':
                    const azura = {
                        station: process.env.AZURA_STATION,
                        url: process.env.AZURA_URL,
                        monitorWhenListeners: process.env.AZURA_LISTENERS_NUM,
                        monitorWhenLive: process.env.AZURA_LIVE,
                        apiKey: process.env.AZURA_KEY
                    }
                    if (!Object.values(azura).every(x => x === undefined)) {
                        configs.push({
                            type: 'azuracast',
                            name: 'unnamed',
                            source: 'ENV',
                            mode: 'single',
                            configureAs: defaultConfigureAs,
                            data: azura as unknown as AzuracastData
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
                const errMsg = `${sourceType}.json config file could not be parsed`;
                this.emitter.emit('error', errMsg);
                this.logger.error(errMsg);
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
                    if(['lastfm','listenbrainz'].includes(sourceType) && 
                    ((rawConf as LastfmSourceConfig | ListenBrainzSourceConfig).configureAs !== 'source')) 
                    {
                        this.logger.debug(`Skipping config ${i + 1} from ${sourceType}.json because it is configured as a client.`);
                        continue;
                    }
                    try {
                        const validConfig = validateJson<SourceConfig>(rawConf, this.getSchemaByType(sourceType), this.logger);

                        // @ts-expect-error will eventually have all info (lazy)
                        const parsedConfig: ParsedConfig = {
                            ...rawConf,
                            source: `${sourceType}.json`,
                            type: sourceType
                        }
                        configs.push(parsedConfig);
                    } catch (e: any) {
                        const configErr = new Error(`The config entry at index ${i} from ${sourceType}.json was not valid`, {cause: e});
                        this.emitter.emit('error', configErr);
                        this.logger.error(configErr);
                    }
                }
            }
        }

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
                        const addError = new Error(`Source ${c.name} of type ${c.type} was not added because of unrecoverable errors`, {cause: e});
                        this.emitter.emit('error', addError);
                        this.logger.error(addError);
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
                const plexConfig = compositeConfig as PlexCompatConfig;
                if(plexConfig.data.token !== undefined) {
                    newSource = await new PlexApiSource(name, compositeConfig as PlexApiSourceConfig, this.internalConfig, this.emitter); 
                } else {
                    newSource = await new PlexSource(name, compositeConfig as PlexSourceConfig, this.internalConfig, 'plex', this.emitter);
                }
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
            case 'endpointlz':
                newSource = await new EndpointListenbrainzSource(name, compositeConfig as ListenbrainzEndpointSourceConfig, this.internalConfig, this.emitter);
                break;
            case 'endpointlfm':
                newSource = await new EndpointLastfmSource(name, compositeConfig as LastFMEndpointSourceConfig, this.internalConfig, this.emitter);
                break;
            case 'icecast':
                newSource = await new IcecastSource(name, compositeConfig as IcecastSourceConfig, this.internalConfig, this.emitter);
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
            case 'musiccast':
                newSource = await new MusicCastSource(name, compositeConfig as MusicCastSourceConfig, this.internalConfig, this.emitter);
                break;
            case 'mpd':
                newSource = await new MPDSource(name, compositeConfig as MPDSourceConfig, this.internalConfig, this.emitter);
                break;
            case 'vlc':
                newSource = await new VLCSource(name, compositeConfig as VLCSourceConfig, this.internalConfig, this.emitter);
                break;
            case 'azuracast':
                newSource = await new AzuracastSource(name, compositeConfig as AzuracastSourceConfig, this.internalConfig, this.emitter);
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
    }
}
