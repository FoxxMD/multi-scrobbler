 
import { childLogger, type Logger } from '@foxxmd/logging';
import type EventEmitter from "events";
import type {InternalConfig, InternalConfigOptional} from "../common/infrastructure/Atomic.ts";
import { clientTypes, isSourceType } from "../../core/Atomic.ts";
import { sourceTypes } from "../../core/Atomic.ts";
import type {SourceType} from "../../core/Atomic.ts";
import {aioSourceRelaxedConfigSchema, type AIOSourceRelaxedConfig, type SourceDefaults} from "../common/infrastructure/config/aioConfig.ts";
import type { WildcardEmitter } from "../common/WildcardEmitter.ts";
import { pick } from '../../core/DataUtils.ts';
import { readJson } from '../utils/DataUtils.ts';
import type AbstractSource from "./AbstractSource.ts";
import { nonEmptyStringOrDefault } from '../../core/StringUtils.ts';
import type {CommonSourceConfig, CommonSourceOptions} from '../common/infrastructure/config/source/index.ts';
import type {ExternalMetadataTerm, PlayTransformHooks} from '../../core/Transform.ts';
import { prettifyError, ZodError } from 'zod';
import { commonComponentEnvConfigToConfigPrimitives, generateCommonComponentEnvConfigSchema, generateConfigLocation, type CommonConfigPrimitives, type UnparsedConfig } from '../common/infrastructure/config/common.ts';
import { getSourceEnvSchema, validateSourceAIOJson, validateSourceJson } from '../common/infrastructure/config/source/sourcesMap.ts';
import type { SourceTypeConfigMap } from "../common/infrastructure/config/source/sourcesMap.ts";
import { stripIndents } from 'common-tags';

type UnparsedSourceConfig = UnparsedConfig<SourceType>;

type CommonParsedConfig = (CommonSourceConfig & {source: string});

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

    buildSourcesFromConfig = async () => {
        const unparsedConfigs: UnparsedSourceConfig[] = [];

        let configFile;
        try {
            configFile = await readJson(`${this.internalConfig.configDir}/config.json`, { throwOnNotFound: false, logger: childLogger(this.logger, `Secrets`) });
        } catch (e) {
            // think this should stay as show-stopper since config could include important defaults (delay, retries) we don't want to ignore
            throw new Error('config.json could not be parsed', { cause: e });
        }

        let sourceDefaults: SourceDefaults;
        if (configFile !== undefined) {
            let aioConfig: AIOSourceRelaxedConfig;
            try {
                aioConfig = aioSourceRelaxedConfigSchema.parse(configFile);
            } catch (e) {
                const msg = `Validation error occurred while trying to parse 'config.json' for Source data/options`;
                if (e instanceof ZodError) {
                    this.logger.error(`${msg}:\n${prettifyError(e)}`);
                } else {
                    this.logger.error(new Error(msg, { cause: e }));
                }
                return;
            }
            const {
                sources: mainConfigs = [],
                sourceDefaults: cd = {},
                database: {
                    retention
                } = {},
            } = aioConfig;
            sourceDefaults = this.buildSourceDefaults({ retention, ...cd });
            for (const [index, c] of mainConfigs.entries()) {
                const { name = 'unnamed' } = c;
                if (c.type === undefined) {
                    const invalidMsgType = `Source config ${index + 1} (${name}) in config.json does not have a "type" property! "type": "[sourceType]" must be one of ${sourceTypes.join(' | ')}`;
                    this.logger.error(invalidMsgType);
                    continue;
                }
                if (isSourceType(c.type)) {
                    unparsedConfigs.push({
                        config: c,
                        source: 'aio',
                        type: c.type,
                        pos: `${index + 1} (${name})`
                    });
                } else {
                    const invalidMsgType = `Source config ${index + 1} (${name}) in config.json has an invalid "type" property. Must be one of must be one of ${sourceTypes.join(' | ')}`;
                    this.logger.error(invalidMsgType);
                    continue;
                }
            }
        } else {
            sourceDefaults = this.buildSourceDefaults();
        }

        const envKeys = Object.keys(process.env).map(x => x.toUpperCase());

        for (const configType of sourceTypes) {

            let sourceUnparsedConfigs = unparsedConfigs.filter(x => x.type === configType);

            const configTypeUpper = configType.toUpperCase();

            let rawConfigs;
            try {
                rawConfigs = await readJson(`${this.internalConfig.configDir}/${configType}.json`, { throwOnNotFound: false, logger: childLogger(this.logger, `${configType} Secrets`) });
            } catch (e) {
                const errMsg = `${configType}.json config file could not be parsed`;
                this.emitter.emit('error', errMsg);
                this.logger.error(errMsg);
            }

            if (rawConfigs !== undefined) {
                this.logger.debug(`Found config file ${configType}.json`);
                if (Array.isArray(rawConfigs)) {
                    sourceUnparsedConfigs = sourceUnparsedConfigs.concat(rawConfigs.map((x, i) => ({ config: x, type: configType, source: 'file', pos: `${i + 1}` })));
                } else if (rawConfigs === null) {
                    this.logger.warn(`${configType}.json contained no data`);
                } else if (typeof rawConfigs === 'object') {
                    sourceUnparsedConfigs.push({ config: rawConfigs, type: configType, source: 'file', pos: `1` })
                } else {
                    this.logger.error(`All top level data from ${configType}.json must be an object or an array of objects, will not parse configs from file`);
                }
            }

            const configKeys = envKeys.filter(x => x.includes(configTypeUpper));
            if (configKeys.length > 0) {
                sourceUnparsedConfigs.push({
                    config: pick(process.env, ...configKeys),
                    type: configType,
                    source: 'env',
                    pos: ''
                })
            }

            let strongConfigs: CommonParsedConfig[] = [];
            for (const entry of sourceUnparsedConfigs) {
                let parsedConfig: CommonParsedConfig;
                try {
                    switch (entry.source) {
                        case 'env': {
                            const envSchema = await getSourceEnvSchema(configType);
                            const primitiveSchema = generateCommonComponentEnvConfigSchema(envSchema.prefix.toUpperCase());
                            const parsed = primitiveSchema.parse(entry.config);
                            const primitives: CommonConfigPrimitives = commonComponentEnvConfigToConfigPrimitives(envSchema.prefix.toUpperCase(), parsed);
                            const parsedEnvConfigValues = envSchema.env.parse(entry.config);
                            const { data = {}, options = {} } = envSchema.toConfig(parsedEnvConfigValues);
                            const transformOptions = transformPresetEnv(envSchema.prefix.toUpperCase());
                            parsedConfig = {
                                name: `${configType} - ${entry.source}${entry.pos !== '' ? ` - ${entry.pos}` : ''} `,
                                ...primitives,
                                data,
                                source: generateConfigLocation('source', entry),
                                options: {
                                    ...options,
                                    ...(transformOptions ?? {})
                                }
                            };
                        } break;
                        case 'file':
                        case 'aio': {
                            if (('configureAs' in entry.config && entry.config.configureAs === 'client')
                                // @ts-expect-error could be a client type
                                || (clientTypes.includes(entry.type) && entry.config.configureAs !== 'source')) {
                                this.logger.debug(`Skipping ${generateConfigLocation('source', entry)} because it is configured as a Client`);
                                continue;
                            }
                            const parsed = entry.source === 'file' ? (await validateSourceJson(entry.type, entry.config)) : (await validateSourceAIOJson(entry.type, entry.config));
                            parsedConfig = {
                                ...parsed,
                                source: generateConfigLocation('source', entry)
                            }
                        } break;
                    }
                } catch (e) {
                    const msg = `Failed to validate ${generateConfigLocation('source', entry)}`;
                    if (e instanceof ZodError) {
                        this.logger.error(`${msg}:\n${prettifyError(e)}`);
                    } else {
                        this.logger.error(new Error(msg, { cause: e }));
                    }
                    continue;
                }

                const existingById = strongConfigs.find(x => x.id === parsedConfig.id);
                if(undefined !== existingById) {
                    this.logger.error(stripIndents`There are two ${configType} Sources that have the same ID:
                        ${existingById.source}
                        ${parsedConfig.source}
                        BOTH of these Sources will be disabled to prevent tainting database history. Correct this issue by using a different ID for at least one of them.`);
                        strongConfigs = strongConfigs.filter(x => x.id !== parsedConfig.id);
                        continue;
                }
                if (parsedConfig.enable === false) {
                    this.logger.debug(`Not using Config ${parsedConfig.source} because it was marked as not enabled.`);
                    continue;
                }
                strongConfigs.push(parsedConfig);
            }

            if(strongConfigs.length > 0) {
                await this.addSource(configType, strongConfigs, sourceDefaults);
            }
        }
    }

    private instantiateSources = async <T extends SourceType>(
        sourceType: T,
        strongConfigs: CommonParsedConfig[],
        defaults: SourceDefaults,
        Ctor: new (name: string, config: SourceTypeConfigMap[T][0], internalConfig: InternalConfig, emitter: WildcardEmitter) => AbstractSource,
    ) => {
        for (const s of strongConfigs) {
            try {
                const config = await validateSourceJson(sourceType, s);
                const compositeOptions = { ...defaults, ...config.options };
                const newComponent = new Ctor(config.name, { ...config, options: compositeOptions }, this.internalConfig, this.emitter);
                newComponent.logger.info(`Source added from ${s.source}`);
                this.sources.push(newComponent);
            } catch (e) {
                this.logger.error(new Error(`${s.source} was not added due to unrecoverable errors`, { cause: e }));
            }
        }
    }

    addSource = async (sourceType: SourceType, strongConfigs: CommonParsedConfig[], defaults: SourceDefaults = {}) => {
        switch (sourceType) {
            case 'spotify': {
                const SpotifySource = (await import('./SpotifySource.ts')).default;
                await this.instantiateSources('spotify', strongConfigs, defaults, SpotifySource);
            } break;
            case 'plex': {
                const PlexApiSource = (await import('./PlexApiSource.ts')).default;
                await this.instantiateSources('plex', strongConfigs, defaults, PlexApiSource);
            } break;
            case 'subsonic': {
                const {SubsonicSource} = (await import('./SubsonicSource.ts'));
                await this.instantiateSources('subsonic', strongConfigs, defaults, SubsonicSource);
            } break;
            case 'jellyfin': {
                const JellyfinApiSource = (await import('./JellyfinApiSource.ts')).default;
                await this.instantiateSources('jellyfin', strongConfigs, defaults, JellyfinApiSource);
            } break;
            case 'lastfm': {
                const LastfmSource = (await import('./LastfmSource.ts')).default;
                await this.instantiateSources('lastfm', strongConfigs, defaults, LastfmSource);
            } break;
            case 'librefm': {
                const LibrefmSource = (await import('./LibrefmSource.ts')).default;
                await this.instantiateSources('librefm', strongConfigs, defaults, LibrefmSource);
            } break;
            case 'deezer': {
                const DeezerInternalSource = (await import('./DeezerInternalSource.ts')).default;
                await this.instantiateSources('deezer', strongConfigs, defaults, DeezerInternalSource);
            } break;
            case 'ytmusic': {
                const YTMusicSource = (await import('./YTMusicSource.ts')).default;
                await this.instantiateSources('ytmusic', strongConfigs, defaults, YTMusicSource);
            } break;
            case 'ymbridge': {
                const YandexMusicBridgeSource = (await import('./YandexMusicBridgeSource.ts')).default;
                await this.instantiateSources('ymbridge', strongConfigs, defaults, YandexMusicBridgeSource);
            } break;
            case 'mpris': {
                const {MPRISSource} = (await import('./MPRISSource.ts'));
                await this.instantiateSources('mpris', strongConfigs, defaults, MPRISSource);
            } break;
            case 'mopidy': {
                const {MopidySource} = (await import('./MopidySource.ts'));
                await this.instantiateSources('mopidy', strongConfigs, defaults, MopidySource);
            } break;
            case 'listenbrainz': {
                const ListenbrainzSource = (await import('./ListenbrainzSource.ts')).default;
                await this.instantiateSources('listenbrainz', strongConfigs, defaults, ListenbrainzSource);
            } break;
            case 'endpointlz': {
                const {EndpointListenbrainzSource} = (await import('./EndpointListenbrainzSource.ts'));
                await this.instantiateSources('endpointlz', strongConfigs, defaults, EndpointListenbrainzSource);
            } break;
            case 'endpointlfm': {
                const {EndpointLastfmSource} = (await import('./EndpointLastfmSource.ts'));
                await this.instantiateSources('endpointlfm', strongConfigs, defaults, EndpointLastfmSource);
            } break;
            case 'icecast': {
                const {IcecastSource} = (await import('./IcecastSource.ts'));
                await this.instantiateSources('icecast', strongConfigs, defaults, IcecastSource);
            } break;
            case 'jriver': {
                const {JRiverSource} = (await import('./JRiverSource.ts'));
                await this.instantiateSources('jriver', strongConfigs, defaults, JRiverSource);
            } break;
            case 'kodi': {
                const {KodiSource} = (await import('./KodiSource.ts'));
                await this.instantiateSources('kodi', strongConfigs, defaults, KodiSource);
            } break;
            case 'webscrobbler': {
                const {WebScrobblerSource} = (await import('./WebScrobblerSource.ts'));
                await this.instantiateSources('webscrobbler', strongConfigs, defaults, WebScrobblerSource);
            } break;
            case 'chromecast': {
                const {ChromecastSource} = (await import('./ChromecastSource.ts'));
                await this.instantiateSources('chromecast', strongConfigs, defaults, ChromecastSource);
            } break;
            case 'musikcube': {
                const {MusikcubeSource} = (await import('./MusikcubeSource.ts'));
                await this.instantiateSources('musikcube', strongConfigs, defaults, MusikcubeSource);
            } break;
            case 'musiccast': {
                const {MusicCastSource} = (await import('./MusicCastSource.ts'));
                await this.instantiateSources('musiccast', strongConfigs, defaults, MusicCastSource);
            } break;
            case 'mpd': {
                const {MPDSource} = (await import('./MPDSource.ts'));
                await this.instantiateSources('mpd', strongConfigs, defaults, MPDSource);
            } break;
            case 'vlc': {
                const {VLCSource} = (await import('./VLCSource.ts'));
                await this.instantiateSources('vlc', strongConfigs, defaults, VLCSource);
            } break;
            case 'azuracast': {
                const {AzuracastSource} = (await import('./AzuracastSource.ts'));
                await this.instantiateSources('azuracast', strongConfigs, defaults, AzuracastSource);
            } break;
            case 'koito': {
                const KoitoSource = (await import('./KoitoSource.ts')).default;
                await this.instantiateSources('koito', strongConfigs, defaults, KoitoSource);
            } break;
            case 'maloja': {
                const MalojaSource = (await import('./MalojaSource.ts')).default;
                await this.instantiateSources('maloja', strongConfigs, defaults, MalojaSource);
            } break;
            case 'tealfm': {
                const TealfmSource = (await import('./TealfmSource.ts')).default;
                await this.instantiateSources('tealfm', strongConfigs, defaults, TealfmSource);
            } break;
            case 'rocksky': {
                const RockskySource = (await import('./RockskySource.ts')).default;
                await this.instantiateSources('rocksky', strongConfigs, defaults, RockskySource);
            } break;
            case 'sonos': {
                const {SonosSource} = (await import('./SonosSource.ts'));
                await this.instantiateSources('sonos', strongConfigs, defaults, SonosSource);
            } break;
            case 'applemusic': {
                const AppleMusicSource = (await import('./AppleMusicSource.ts')).default;
                await this.instantiateSources('applemusic', strongConfigs, defaults, AppleMusicSource);
            } break;
            default:
                break;
        }
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

    // @ts-expect-error T is fine
    return {
        ...(existing || {}),
        playTransform: popts
    };
}