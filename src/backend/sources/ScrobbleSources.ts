/* eslint-disable no-case-declarations */
import { childLogger, Logger } from '@foxxmd/logging';
import EventEmitter from "events";
import { ConfigMeta, InternalConfig, InternalConfigOptional, isSourceType, SourceType, sourceTypes } from "../common/infrastructure/Atomic.js";
import { AIOConfig, SourceDefaults } from "../common/infrastructure/config/aioConfig.js";
import { AzuracastData, AzuracastSourceConfig } from "../common/infrastructure/config/source/azuracast.js";
import { ChromecastSourceConfig } from "../common/infrastructure/config/source/chromecast.js";
import { DeezerData, DeezerSourceConfig, DeezerInternalSourceConfig, DeezerCompatConfig, DeezerInternalData } from "../common/infrastructure/config/source/deezer.js";
import { ListenbrainzEndpointSourceConfig, ListenbrainzEndpointData } from "../common/infrastructure/config/source/endpointlz.js";
import { LastFMEndpointSourceConfig, LastFMEndpointData } from "../common/infrastructure/config/source/endpointlfm.js";
import {
    JellyApiData,
    JellyApiSourceConfig,
} from "../common/infrastructure/config/source/jellyfin.js";
import { JRiverData, JRiverSourceConfig } from "../common/infrastructure/config/source/jriver.js";
import { KodiData, KodiSourceConfig } from "../common/infrastructure/config/source/kodi.js";
import { LastfmSourceConfig } from "../common/infrastructure/config/source/lastfm.js";
import { ListenBrainzSourceConfig } from "../common/infrastructure/config/source/listenbrainz.js";
import { MopidySourceConfig } from "../common/infrastructure/config/source/mopidy.js";
import { MusicCastData, MusicCastSourceConfig } from "../common/infrastructure/config/source/musiccast.js";
import { IcecastData, IcecastSourceConfig, IcecastSourceOptions } from "../common/infrastructure/config/source/icecast.js";
import { MPDData, MPDSourceConfig } from "../common/infrastructure/config/source/mpd.js";
import { MPRISData, MPRISSourceConfig } from "../common/infrastructure/config/source/mpris.js";
import { MusikcubeData, MusikcubeSourceConfig } from "../common/infrastructure/config/source/musikcube.js";
import { PlexApiSourceConfig } from "../common/infrastructure/config/source/plex.js";
import { MalojaSourceConfig } from "../common/infrastructure/config/source/maloja.js";
import { SourceAIOConfig, SourceConfig } from "../common/infrastructure/config/source/sources.js";
import { SpotifySourceConfig, SpotifySourceData } from "../common/infrastructure/config/source/spotify.js";
import { SubsonicData, SubSonicSourceConfig } from "../common/infrastructure/config/source/subsonic.js";
import { VLCData, VLCSourceConfig } from "../common/infrastructure/config/source/vlc.js";
import { WebScrobblerSourceConfig } from "../common/infrastructure/config/source/webscrobbler.js";
import { YTMusicData, YTMusicSourceConfig } from "../common/infrastructure/config/source/ytmusic.js";
import { SonosData, SonosSourceConfig } from "../common/infrastructure/config/source/sonos.js";
import { WildcardEmitter } from "../common/WildcardEmitter.js";
import { parseBool } from "../utils.js";
import { readJson } from '../utils/DataUtils.js';
import { validateJson } from "../utils/ValidationUtils.js";
import AbstractSource from "./AbstractSource.js";
import { nonEmptyStringOrDefault } from '../../core/StringUtils.js';
import { KoitoSourceConfig } from '../common/infrastructure/config/source/koito.js';
import { TealSourceConfig } from '../common/infrastructure/config/source/tealfm.js';
import { RockskySourceConfig } from '../common/infrastructure/config/source/rocksky.js';
import { CommonSourceOptions } from '../common/infrastructure/config/source/index.js';
import { ExternalMetadataTerm, PlayTransformHooks, PlayTransformOptions } from '../common/infrastructure/Transform.js';
import { LibrefmSourceConfig } from '../common/infrastructure/config/source/librefm.js';
import { AppleMusicSourceConfig } from '../common/infrastructure/config/source/apple.js';

type groupedNamedConfigs = {[key: string]: ParsedConfig[]};

type ParsedConfig = SourceAIOConfig & ConfigMeta;

export default class ScrobbleSources {

    sources: AbstractSource[] = [];
    logger: Logger;
    internalConfig: InternalConfig;

    emitter: WildcardEmitter;

    constructor(emitter: EventEmitter, internal: InternalConfigOptional, parentLogger: Logger) {
        this.emitter = emitter;
        this.logger = childLogger(parentLogger, 'Sources');
        this.internalConfig = {
            ...internal,
            logger: this.logger
        }
    }

    getByName = (name: any, safe: boolean = false) => this.sources.find(x => (safe ? x.getSafeExternalName() : x.name) === name)

    getByType = (type: any) => this.sources.filter(x => x.type === type)

    getByNameAndType = (name: string, type: SourceType, safe: boolean = false) => this.sources.find(x => (safe ? x.getSafeExternalName() : x.name) === name && x.type === type)

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

    private getSchemaByType = (type: SourceType): string => {
            switch(type) {
                case 'spotify':
                    return "SpotifySourceConfig";
                case 'plex':
                    return "PlexCompatConfig";
                case 'deezer':
                    return "DeezerCompatConfig";
                case 'endpointlz':
                    return "ListenbrainzEndpointSourceConfig";
                case 'endpointlfm':
                    return "LastFMEndpointSourceConfig";
                case 'icecast':
                    return "IcecastSourceConfig";
                case 'subsonic':
                    return "SubSonicSourceConfig";
                case 'jellyfin':
                    return "JellyfinCompatConfig";
                case 'lastfm':
                    return "LastfmSourceConfig";
                case 'librefm':
                    return "LibrefmSourceConfig";
                case 'ytmusic':
                    return "YTMusicSourceConfig";
                case 'maloja':
                    return "MalojaSourceConfig";
                case 'mpris':
                    return "MPRISSourceConfig";
                case 'mopidy':
                    return "MopidySourceConfig";
                case 'listenbrainz':
                    return "ListenBrainzSourceConfig";
                case 'jriver':
                    return "JRiverSourceConfig";
                case 'kodi':
                    return "KodiSourceConfig";
                case 'chromecast':
                    return "ChromecastSourceConfig";
                case 'webscrobbler':
                    return "WebScrobblerSourceConfig";
                case 'musikcube':
                    return "MusikcubeSourceConfig";
                case 'musiccast':
                    return "MusicCastSourceConfig";
                case 'mpd':
                    return "MPDSourceConfig";
                case 'vlc':
                    return "VLCSourceConfig";
                case 'azuracast':
                    return "AzuracastSourceConfig";
                case 'koito':
                    return "KoitoSourceConfig";
                case 'tealfm':
                    return "TealSourceConfig";
                case 'rocksky':
                    return "RockskySourceConfig";
                case 'sonos':
                    return 'SonosSourceConfig';
                case 'apple':
                    return 'AppleMusicSourceConfig';
            }
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
            configFile = await readJson(`${this.internalConfig.configDir}/config.json`, {throwOnNotFound: false, logger: childLogger(this.logger, `Secrets`)});
        } catch (e) {
            throw new Error('config.json could not be parsed');
        }

        let sourceDefaults = {};
        if (configFile !== undefined) {
            const aioConfig = await validateJson<AIOConfig>('source', configFile, 'AIOSourceRelaxedConfig', this.logger);
            const {
                sources: mainConfigSourcesConfigs = [],
                sourceDefaults: sd = {},
            } = aioConfig;
            sourceDefaults = this.buildSourceDefaults(sd);
            for (const [index, c] of mainConfigSourcesConfigs.entries()) {
                const {name = 'unnamed'} = c;
                if(c.type === undefined) {
                    const invalidMsgType = `Source config ${index + 1} (${name}) in config.json does not have a "type" property! "type": "[sourceType]" must be one of ${sourceTypes.join(' | ')}`;
                    this.emitter.emit('error', new Error(invalidMsgType));
                    this.logger.error(invalidMsgType);
                    continue;
                }
                if(!isSourceType(c.type.toLocaleLowerCase())) {
                    const invalidMsgType = `Source config ${index + 1} (${name}) in config.json has an invalid source "type" of "${c.type}". Must be one of ${sourceTypes.join(' | ')}`;
                    this.emitter.emit('error', new Error(invalidMsgType));
                    this.logger.error(invalidMsgType);
                    continue;
                }
                if(['lastfm','listenbrainz','koito','tealfm','rocksky'].includes(c.type.toLocaleLowerCase()) && ((c as LastfmSourceConfig | ListenBrainzSourceConfig | KoitoSourceConfig | TealSourceConfig | RockskySourceConfig).configureAs !== 'source')) 
                {
                   this.logger.debug(`Skipping config ${index + 1} (${name}) in config.json because it is configured as a client.`);
                   continue;
                }
                try {
                    await validateJson<SourceConfig>('source', c, this.getSchemaByType(c.type.toLocaleLowerCase() as SourceType), this.logger);
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
                            data: s as SpotifySourceData,
                            options: transformPresetEnv('SPOTIFY')
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
                            data: p,
                            options: transformPresetEnv('PLEX')
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
                            data: sub as SubsonicData,
                            options: transformPresetEnv('SUBSONIC')
                        })
                    }
                    break;
                case 'jellyfin':
                    const j: JellyApiData = {
                        user: process.env.JELLYFIN_USER,
                        password: process.env.JELLYFIN_PASSWORD,
                        apiKey: process.env.JELLYFIN_APIKEY,
                        url: process.env.JELLYFIN_URL,
                        usersAllow: process.env.JELLYFIN_USERS_ALLOW,
                        usersBlock: process.env.JELLYFIN_USERS_BLOCK,
                        devicesAllow: process.env.JELLYFIN_DEVICES_ALLOW,
                        deviceBlock: process.env.JELLYFIN_DEVICES_BLOCK,
                        librariesAllow: process.env.JELLYFIN_LIBRARIES_ALLOW,
                        librariesBlock: process.env.JELLYFIN_LIBRARIES_BLOCK,
                        frontendUrlOverride: process.env.JELLYFIN_FRONTEND_URL_OVERRIDE 
                    };
                    if (!Object.values(j).every(x => x === undefined)) {
                        configs.push({
                            type: 'jellyfin',
                            name: 'unnamed',
                            source: 'ENV',
                            mode: 'single',
                            configureAs: defaultConfigureAs,
                            data: j,
                            options: transformPresetEnv('JELLYFIN')
                        })
                    }
                    break;
                case 'lastfm':
                        {
                        const lfm = {
                            apiKey: process.env.SOURCE_LASTFM_API_KEY,
                            secret: process.env.SOURCE_LASTFM_SECRET,
                            redirectUri: process.env.SOURCE_LASTFM_REDIRECT_URI,
                            session: process.env.SOURCE_LASTFM_SESSION,
                        };
                        if (!Object.values(lfm).every(x => x === undefined)) {
                            configs.push({
                                type: 'lastfm',
                                name: 'unnamed-lfm-source',
                                source: 'ENV',
                                mode: 'single',
                                configureAs: 'source',
                                data: lfm,
                                options: transformPresetEnv('SOURCE_LASTFM')
                            })
                        }
                    }
                    break;
                case 'deezer':
                    const d = {
                        clientId: process.env.DEEZER_CLIENT_ID,
                        clientSecret: process.env.DEEZER_CLIENT_SECRET,
                        redirectUri: process.env.DEEZER_REDIRECT_URI,
                        accessToken: process.env.DEEZER_ACCESS_TOKEN,
                        arl: process.env.DEEZER_ARL,
                    };
                    if (!Object.values(d).every(x => x === undefined)) {
                        configs.push({
                            type: 'deezer',
                            name: 'unnamed',
                            source: 'ENV',
                            mode: 'single',
                            configureAs: defaultConfigureAs,
                            data: d as DeezerData,
                            options: transformPresetEnv('DEEZER')
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
                            data: mp as MPRISData,
                            options: transformPresetEnv('MPRIS')
                        });
                    }
                    break;
                case 'maloja': {
                    // env builder for single user mode
                    const url = process.env.SOURCE_MALOJA_URL;
                    const apiKey = process.env.SOURCE_MALOJA_API_KEY;
                    if (url !== undefined || apiKey !== undefined) {
                        configs.push({
                            type: 'maloja',
                            name: 'unnamed-mlj-source',
                            source: 'ENV',
                            mode: 'single',
                            configureAs: 'source',
                            data: {
                                url,
                                apiKey
                            },
                            options: transformPresetEnv('SOURCE_MALOJA')
                        })
                    }
                }
                    break;
                case 'librefm':{
                    const shouldUse = parseBool(process.env.LIBRFM_ENABLE)
                    const libre = {
                        apiKey: process.env.SOURCE_LIBREFM_API_KEY,
                        secret: process.env.SOURCE_LIBREFM_SECRET,
                        redirectUri: process.env.SOURCE_LIBREFM_REDIRECT_URI,
                        session: process.env.SOURCE_LIBREFM_SESSION,
                        urlBase: process.env.SOURCE_LIBREFM_URLBASE,
                    };
                    if (!Object.values(libre).every(x => x === undefined) || shouldUse) {
                        configs.push({
                            type: 'librefm',
                            name: 'unnamed-librefm-source',
                            source: 'ENV',
                            mode: 'single',
                            configureAs: 'source',
                            data: libre,
                            options: transformPresetEnv('SOURCE_LIBREFM')
                        })
                    }
                }
                    break;
                case 'listenbrainz': {
                    const lz = {
                        url: process.env.SOURCE_LZ_URL,
                        token: process.env.SOURCE_LZ_TOKEN,
                        username: process.env.SOURCE_LZ_USER
                    };
                    if (!Object.values(lz).every(x => x === undefined)) {
                        configs.push({
                            type: 'listenbrainz',
                            name: 'unnamed-lz-source',
                            source: 'ENV',
                            mode: 'single',
                            configureAs: 'source',
                            data: lz,
                            options: transformPresetEnv('SOURCE_LZ')
                        })
                    }
                }
                    break;
                case 'koito': {
                    const koit = {
                        url: process.env.SOURCE_KOITO_URL,
                        token: process.env.SOURCE_KOITO_TOKEN,
                        username: process.env.SOURCE_KOITO_USER
                    };
                    if (!Object.values(koit).every(x => x === undefined)) {
                        configs.push({
                            type: 'koito',
                            name: 'unnamed-koito-source',
                            source: 'ENV',
                            mode: 'single',
                            configureAs: 'source',
                            data: koit,
                            options: transformPresetEnv('SOURCE_KOITO')
                        })
                    }
                }
                    break;
                case 'tealfm': {
                    const teal = {
                        identifier: process.env.SOURCE_TEALFM_IDENTIFIER,
                        appPassword: process.env.SOURCE_TEALFM_APP_PW,
                        pds: process.env.SOURCE_TEALFM_PDS
                    };
                    if (!Object.values(teal).every(x => x === undefined)) {
                        configs.push({
                            type: 'tealfm',
                            name: 'unnamed-tealfm-source',
                            source: 'ENV',
                            mode: 'single',
                            configureAs: 'source',
                            data: teal,
                            options: transformPresetEnv('SOURCE_TEALFM')
                        })
                    }
                }
                    break;
                case 'rocksky': {
                    const rocksky = {
                        key: process.env.SOURCE_ROCKSKY_KEY,
                        handle: process.env.SOURCE_ROCKSKY_HANDLE
                    };
                    if (!Object.values(rocksky).every(x => x === undefined)) {
                        configs.push({
                            type: 'rocksky',
                            name: 'unnamed-rocksky-source',
                            source: 'ENV',
                            mode: 'single',
                            configureAs: 'source',
                            data: rocksky,
                            options: transformPresetEnv('SOURCE_ROCKSKY')
                        })
                    }
                }
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
                            data: lze as ListenbrainzEndpointData,
                            options: transformPresetEnv('LZE')
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
                            data: lfme as LastFMEndpointData,
                            options: transformPresetEnv('LFM')
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
                            options: transformPresetEnv<IcecastSourceOptions>('ICECAST', {
                                systemScrobble: parseBool(icecast.scrobbleOnStart)
                            })
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
                            data: jr as JRiverData,
                            options: transformPresetEnv('JRIVER')
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
                            data: ko as KodiData,
                            options: transformPresetEnv('KODI')
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
                            },
                            options: transformPresetEnv('WS')
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
                            },
                            options: transformPresetEnv('CC')
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
                            data: musecase as MusicCastData,
                            options: transformPresetEnv('MCAST')
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
                            data: mc as MusikcubeData,
                            options: transformPresetEnv('MC')
                        });
                    }
                    break;
                case 'mpd':
                    const mpd = {
                        url: process.env.MPD_URL,
                        password: process.env.MPD_PASSWORD
                    }
                    if (!Object.values(mpd).every(x => x === undefined)) {
                        configs.push({
                            type: 'mpd',
                            name: 'unnamed',
                            source: 'ENV',
                            mode: 'single',
                            configureAs: defaultConfigureAs,
                            data: mpd as MPDData,
                            options: transformPresetEnv('MPD')
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
                            data: vlc as VLCData,
                            options: transformPresetEnv('VLC')
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
                            data: ytm as YTMusicData,
                            options: transformPresetEnv('YTM')
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
                            data: azura as unknown as AzuracastData,
                            options: transformPresetEnv('AZURA')
                        });
                    }
                    break;
                case 'sonos': {
                    const sonos = {
                        host: process.env.SONOS_HOST,
                        devicesAllow: process.env.SONOS_DEVICES_ALLOW,
                        devicesBlock: process.env.SONOS_DEVICES_BLOCK,
                        groupsAllow: process.env.SONOS_GROUPS_ALLOW,
                        groupsBlocks: process.env.SONOS_GROUPS_BLOCK
                    }
                    if (!Object.values(sonos).every(x => x === undefined)) {
                        configs.push({
                            type: 'sonos',
                            name: 'unnamed',
                            source: 'ENV',
                            mode: 'single',
                            configureAs: defaultConfigureAs,
                            data: sonos as unknown as SonosData,
                            options: transformPresetEnv('SONOS')
                        });
                    }
                }    break;                       
                default:
                    break;
            }
            let rawSourceConfigs;
            try {
                rawSourceConfigs = await readJson(`${this.internalConfig.configDir}/${sourceType}.json`, {throwOnNotFound: false, logger: childLogger(this.logger, `${sourceType} Secrets`)});
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
                    if(['lastfm','listenbrainz','koito','maloja','tealfm','rocksky','librefm'].includes(sourceType) && 
                    ((rawConf as LastfmSourceConfig | LibrefmSourceConfig | ListenBrainzSourceConfig | KoitoSourceConfig | MalojaSourceConfig | TealSourceConfig | RockskySourceConfig).configureAs !== 'source')) 
                    {
                        this.logger.debug(`Skipping config ${i + 1} from ${sourceType}.json because it is configured as a client.`);
                        continue;
                    }
                    try {
                        const validConfig = await validateJson<SourceConfig>('source', rawConf, this.getSchemaByType(sourceType), this.logger);

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
                        const addError = new Error(`Source ${c.name} of type ${c.type} from source ${c.source} was not added because of unrecoverable errors`, {cause: e});
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

        const {type, name, data: d = {}, enable = true, source, options: clientOptions = {}} = clientConfig;

        if(enable === false) {
            this.logger.warn({labels: [`${type} - ${name}`]},`Source from ${source} was disabled by config`);
            return;
        }
        
        // add defaults
        const compositeConfig: SourceConfig = {...clientConfig, data: d, options: {...defaults, ...clientOptions}};

        this.logger.debug({labels: [`${type} - ${name}`]},`Constructing Source from ${source}...`);
        let newSource: AbstractSource;
        switch (type) {
            case 'spotify':
                const SpotifySource = (await import('./SpotifySource.js')).default;
                newSource = new SpotifySource(name, compositeConfig as SpotifySourceConfig, this.internalConfig, this.emitter);
                break;
            case 'plex':
                const PlexApiSource = (await import('./PlexApiSource.js')).default;
                newSource = await new PlexApiSource(name, compositeConfig as PlexApiSourceConfig, this.internalConfig, this.emitter); 
                break;
            case 'subsonic':
                const {SubsonicSource} = (await import('./SubsonicSource.js'));
                newSource = new SubsonicSource(name, compositeConfig as SubSonicSourceConfig, this.internalConfig, this.emitter);
                break;
            case 'jellyfin':
                const JellyfinApiSource = (await import('./JellyfinApiSource.js')).default;
                newSource = await new JellyfinApiSource(name, compositeConfig as JellyApiSourceConfig, this.internalConfig, this.emitter);
                break;
            case 'lastfm':
                const LastfmSource = (await import('./LastfmSource.js')).default;
                newSource = await new LastfmSource(name, compositeConfig as LastfmSourceConfig, this.internalConfig, this.emitter);
                break;
            case 'librefm':
                const LibrefmSource = (await import('./LibrefmSource.js')).default;
                newSource = await new LibrefmSource(name, compositeConfig as LibrefmSourceConfig, this.internalConfig, this.emitter);
                break;
            case 'deezer':
                const deezerConfig = compositeConfig as DeezerCompatConfig;
                if(deezerConfig.data.arl !== undefined) {
                    const DeezerInternalSource = (await import('./DeezerInternalSource.js')).default;
                    newSource = await new DeezerInternalSource(name, compositeConfig as DeezerInternalSourceConfig, this.internalConfig, this.emitter);
                } else {
                    const DeezerSource = (await import('./DeezerSource.js')).default;
                    newSource = await new DeezerSource(name, compositeConfig as DeezerSourceConfig, this.internalConfig, this.emitter);
                }
                break;
            case 'ytmusic':
                const YTMusicSource = (await import('./YTMusicSource.js')).default;
                newSource = await new YTMusicSource(name, compositeConfig as YTMusicSourceConfig, this.internalConfig, this.emitter);
                break;
            case 'mpris':
                const {MPRISSource} = (await import('./MPRISSource.js'));
                newSource = await new MPRISSource(name, compositeConfig as MPRISSourceConfig, this.internalConfig, this.emitter);
                break;
            case 'mopidy':
                const {MopidySource} = (await import('./MopidySource.js'));
                newSource = await new MopidySource(name, compositeConfig as MopidySourceConfig, this.internalConfig, this.emitter);
                break;
            case 'listenbrainz':
                const ListenbrainzSource = (await import('./ListenbrainzSource.js')).default;
                newSource = await new ListenbrainzSource(name, compositeConfig as ListenBrainzSourceConfig, this.internalConfig, this.emitter);
                break;
            case 'endpointlz':
                const {EndpointListenbrainzSource} = (await import('./EndpointListenbrainzSource.js'));
                newSource = await new EndpointListenbrainzSource(name, compositeConfig as ListenbrainzEndpointSourceConfig, this.internalConfig, this.emitter);
                break;
            case 'endpointlfm':
                const {EndpointLastfmSource} = (await import('./EndpointLastfmSource.js'));
                newSource = await new EndpointLastfmSource(name, compositeConfig as LastFMEndpointSourceConfig, this.internalConfig, this.emitter);
                break;
            case 'icecast':
                const {IcecastSource} = (await import('./IcecastSource.js'));
                newSource = await new IcecastSource(name, compositeConfig as IcecastSourceConfig, this.internalConfig, this.emitter);
                break;
            case 'jriver':
                const {JRiverSource} = (await import('./JRiverSource.js'));
                newSource = await new JRiverSource(name, compositeConfig as JRiverSourceConfig, this.internalConfig, this.emitter);
                break;
            case 'kodi':
                const {KodiSource} = (await import('./KodiSource.js'));
                newSource = await new KodiSource(name, compositeConfig as KodiSourceConfig, this.internalConfig, this.emitter);
                break;
            case 'webscrobbler':
                const {WebScrobblerSource} = (await import('./WebScrobblerSource.js'));
                newSource = await new WebScrobblerSource(name, compositeConfig as WebScrobblerSourceConfig, this.internalConfig, this.emitter);
                break;
            case 'chromecast':
                const {ChromecastSource} = (await import('./ChromecastSource.js'));
                newSource = await new ChromecastSource(name, compositeConfig as ChromecastSourceConfig, this.internalConfig, this.emitter);
                break;
            case 'musikcube':
                const {MusikcubeSource} = (await import('./MusikcubeSource.js'));
                newSource = await new MusikcubeSource(name, compositeConfig as MusikcubeSourceConfig, this.internalConfig, this.emitter);
                break;
            case 'musiccast':
                const {MusicCastSource} = (await import('./MusicCastSource.js'));
                newSource = await new MusicCastSource(name, compositeConfig as MusicCastSourceConfig, this.internalConfig, this.emitter);
                break;
            case 'mpd':
                const {MPDSource} = (await import('./MPDSource.js'));
                newSource = await new MPDSource(name, compositeConfig as MPDSourceConfig, this.internalConfig, this.emitter);
                break;
            case 'vlc':
                const {VLCSource} = (await import('./VLCSource.js'));
                newSource = await new VLCSource(name, compositeConfig as VLCSourceConfig, this.internalConfig, this.emitter);
                break;
            case 'azuracast':
                const {AzuracastSource} = (await import('./AzuracastSource.js'));
                newSource = await new AzuracastSource(name, compositeConfig as AzuracastSourceConfig, this.internalConfig, this.emitter);
                break;
            case 'koito':
                const KoitoSource = (await import('./KoitoSource.js')).default;
                newSource = await new KoitoSource(name, compositeConfig as KoitoSourceConfig, this.internalConfig, this.emitter);
                break;
            case 'maloja':
                const MalojaSource = (await import('./MalojaSource.js')).default;
                newSource = await new MalojaSource(name, compositeConfig as MalojaSourceConfig, this.internalConfig, this.emitter);
                break;
            case 'tealfm':
                const TealfmSource = (await import('./TealfmSource.js')).default;
                newSource = await new TealfmSource(name, compositeConfig as TealSourceConfig, this.internalConfig, this.emitter);
                break;
            case 'rocksky':
                const RockskySource = (await import('./RockskySource.js')).default;
                newSource = await new RockskySource(name, compositeConfig as RockskySourceConfig, this.internalConfig, this.emitter);
                break;
            case 'sonos':
                const {SonosSource} = (await import('./SonosSource.js'));
                newSource = await new SonosSource(name, compositeConfig as SonosSourceConfig, this.internalConfig, this.emitter);
                break;
            case 'apple':
                const {AppleSource} = (await import('./AppleSource.js'));
                newSource = await new AppleSource(name, compositeConfig as AppleMusicSourceConfig, this.internalConfig, this.emitter);
                break;
            default:
                break;
        }

        if(newSource === undefined) {
            // really shouldn't get here!
            this.logger.error(new Error(`Source of type ${type} from ${source} was not recognized??`));
            return;
        }
        this.sources.push(newSource);
        newSource.logger.info(`Source Added from ${source}`);
    }
}

const transformPresetEnv = <T extends CommonSourceOptions = CommonSourceOptions>(prefix: string, existing: T = undefined): undefined | T => {

    const env = process.env[`${prefix}_TRANSFORMS`];
    if(env === undefined || env.trim() === '') {
        return existing;
    }

    const popts: PlayTransformHooks<ExternalMetadataTerm> = {
        preCompare: [
        ]
    }
    for(const p of env.split(',').map(x => x.trim().toLocaleLowerCase())) {
        switch(p) {
            case 'native':
                popts.preCompare.push({type: 'native'});
                break;
            case 'musicbrainz':
                popts.preCompare.push({type: 'musicbrainz'});
                break;
        }
    }

    // @ts-ignore
    return {
        ...(existing || {}),
        playTransform: popts
    };
}