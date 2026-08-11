 
import { childLogger, type Logger } from '@foxxmd/logging';
import dayjs, { type Dayjs } from "dayjs";
import type {PlayObject, SourcePlayerObj} from "../../core/Atomic.ts";
import type {InternalConfig, InternalConfigOptional, SourceIdentifier} from "../common/infrastructure/Atomic.ts";
import { isClientType } from '../../core/Atomic.ts';
import { clientTypes } from "../../core/Atomic.ts";
import type {ClientType} from "../../core/Atomic.ts";
import {aioClientRelaxedConfigSchema, type AIOClientRelaxedConfig, type ClientDefaults} from "../common/infrastructure/config/aioConfig.ts";
import type { WildcardEmitter } from "../common/WildcardEmitter.ts";
import { pick } from '../../core/DataUtils.ts';
import { readJson } from '../utils/DataUtils.ts';
import type AbstractScrobbleClient from "./AbstractScrobbleClient.ts";
import clone from 'clone';
import { stripIndents } from 'common-tags';
import { normalizeStr, type StringNormalizationOptions } from '../utils/StringUtils.ts';
import { prettifyError, ZodError } from 'zod';
import { commonComponentEnvConfigToConfigPrimitives, generateCommonComponentEnvConfigSchema, generateConfigLocation, transformPresetEnv, type CommonConfigPrimitives, type UnparsedConfig } from '../common/infrastructure/config/common.ts';
import type { CommonClientConfig } from '../common/infrastructure/config/client/index.ts';
import { getClientEnvSchema, validateClientAIOJson, validateClientJson, type ClientTypeConfigMap } from '../common/infrastructure/config/client/clientsMap.ts';
import type { MSBackendEventMap } from '../common/infrastructure/MSBackendEventMap.ts';

type UnparsedClientConfig = UnparsedConfig<ClientType>;

type CommonParsedConfig = (CommonClientConfig & {source: string});

const clientScrobbleToNormalization: StringNormalizationOptions = {
    removeWhitespace: true,
    removeSymbols: false,
    normalizeUnicode: false,
    removeDiacritics: false
}

export default class ScrobbleClients {

    clients: AbstractScrobbleClient[] = [];
    logger: Logger;

    internalConfig: InternalConfig;

    emitter: WildcardEmitter<MSBackendEventMap>;

    sourceEmitter: WildcardEmitter<MSBackendEventMap>;

    scrobbleToNamesWarnings: string[] = [];

    configErrors: (string | Error)[] = [];
    instantiateErrors: Error[] = [];

    constructor(emitter: WildcardEmitter<MSBackendEventMap>, sourceEmitter: WildcardEmitter<MSBackendEventMap>, internal: InternalConfigOptional, parentLogger: Logger) {
        this.emitter = emitter;
        this.sourceEmitter = sourceEmitter;
        this.logger = childLogger(parentLogger, 'Scrobblers'); // winston.loggers.get('app').child({labels: ['Scrobblers']}, mergeArr);
        this.internalConfig = {
            ...internal,
            logger: this.logger
        }

        this.sourceEmitter.on('playerUpdate', async (payload) => {
            // agressively update Now Playing so scrobblers that display based on duration are mostly synced
            // but aggressively *stop* updating if state becomes stale/orphaned
            this.playingNow(payload.data, {...payload.data.options, scrobbleFrom: { type: payload.type, name: payload.name}});
        });

        this.sourceEmitter.on('discoveredToScrobble', async (payload) => {
            await this.scrobble(payload.data.data, payload.data.options);
        });
    }

    getByName = (name: any, safe: boolean = false) => this.clients.find(x => (safe ? x.getSafeExternalName() : x.name) === name)

    getByType = (type: any) => this.clients.filter(x => x.type === type)

    getByNameAndType = (name: string, type: ClientType, safe: boolean = false) => this.clients.find(x => (safe ? x.getSafeExternalName() : x.name) === name && x.type === type)

    async getStatusSummary(type?: string, name?: string): Promise<[boolean, string[]]> {
        let clients: AbstractScrobbleClient[] = [];

        const messages: string[] = [];
        let clientsReady = true;

        if(type !== undefined) {
            clients = this.getByType(type);
        } else if(name !== undefined) {
            const clientByName = this.getByName(name);
            if(clientByName !== undefined) {
                clients = [clientByName];
            }
        } else {
            clients = this.clients;
        }

        for(const client of clients) {
            if(!(await client.isReady())) {
                clientsReady = false;
                messages.push(`Client ${client.type} - ${client.name} is not ready.`);
            }
        }

        return [clientsReady, messages];
    }

    buildClientsFromConfig = async () => {
        const unparsedConfigs: UnparsedClientConfig[] = [];
        this.configErrors = [];
        this.instantiateErrors = [];

        let configFile;
        try {
            configFile = await readJson(`${this.internalConfig.configDir}/config.json`, { throwOnNotFound: false, logger: childLogger(this.logger, `Secrets`) });
        } catch (e) {
            // think this should stay as show-stopper since config could include important defaults (delay, retries) we don't want to ignore
            throw new Error('config.json could not be parsed', { cause: e });
        }

        let clientDefaults: ClientDefaults = {};
        if (configFile !== undefined) {
            let aioConfig: AIOClientRelaxedConfig;
            try {
                aioConfig = aioClientRelaxedConfigSchema.parse(configFile);
            } catch (e) {
                const msg = `Validation error occurred while trying to parse 'config.json' for Client data/options`;
                if (e instanceof ZodError) {
                    this.logger.error(`${msg}:\n${prettifyError(e)}`);
                } else {
                    this.logger.error(new Error(msg, { cause: e }));
                }
                return;
            }
            const {
                clients: mainConfigClientConfigs = [],
                clientDefaults: cd = {},
                database: {
                    retention
                } = {},
            } = aioConfig;
            clientDefaults = { retention, ...cd };
            for (const [index, c] of mainConfigClientConfigs.entries()) {
                const { name = 'unnamed' } = c;
                if (c.type === undefined) {
                    const invalidMsgType = `Client config ${index + 1} (${name}) in config.json does not have a "type" property! "type": "[clientType]" must be one of ${clientTypes.join(' | ')}`;
                    this.logger.error(invalidMsgType);
                    continue;
                }
                if (isClientType(c.type)) {
                    unparsedConfigs.push({
                        config: c,
                        source: 'aio',
                        type: c.type,
                        pos: `${index + 1} (${name})`
                    });
                } else {
                    const invalidMsgType = `Client config ${index + 1} (${name}) in config.json has an invalid "type" property. Must be one of must be one of ${clientTypes.join(' | ')}`;
                    this.logger.error(invalidMsgType);
                    continue;
                }
            }
        }

        const envKeys = Object.keys(process.env).map(x => x.toUpperCase());

        for (const clientType of clientTypes) {

            let clientUnparsedConfigs = unparsedConfigs.filter(x => x.type === clientType);

            const clientUpper = clientType.toUpperCase();

            let rawClientConfigs;
            try {
                rawClientConfigs = await readJson(`${this.internalConfig.configDir}/${clientType}.json`, { throwOnNotFound: false, logger: childLogger(this.logger, `${clientType} Secrets`) });
            } catch (e) {
                const errMsg = `${clientType}.json config file could not be parsed`;
                this.emitter.emit('error', errMsg);
                this.logger.error(errMsg);
            }

            if (rawClientConfigs !== undefined) {
                this.logger.debug(`Found config file ${clientType}.json`);
                if (Array.isArray(rawClientConfigs)) {
                    clientUnparsedConfigs = clientUnparsedConfigs.concat(rawClientConfigs.map((x, i) => ({ config: x, type: clientType, source: 'file', pos: `${i + 1}` })));
                } else if (rawClientConfigs === null) {
                    this.logger.warn(`${clientType}.json contained no data`);
                } else if (typeof rawClientConfigs === 'object') {
                    clientUnparsedConfigs.push({ config: rawClientConfigs, type: clientType, source: 'file', pos: `1` })
                } else {
                    this.logger.error(`All top level data from ${clientType}.json must be an object or an array of objects, will not parse configs from file`);
                }
            }

            const envSchema = await getClientEnvSchema(clientType);
            const configTypeUpper = envSchema.prefix.toUpperCase();

            const clientKeys = envKeys.filter(x => x.startsWith(`${configTypeUpper}_`));
            if (clientKeys.length > 0) {
                clientUnparsedConfigs.push({
                    config: pick(process.env, ...clientKeys),
                    type: clientType,
                    source: 'env',
                    pos: ''
                })
            }

            let strongConfigs: CommonParsedConfig[] = [];
            for (const entry of clientUnparsedConfigs) {
                let parsedConfig: CommonParsedConfig;
                try {
                    switch (entry.source) {
                        case 'env': {
                            const envSchema = await getClientEnvSchema(clientType);
                            const primitiveSchema = generateCommonComponentEnvConfigSchema(configTypeUpper);
                            const parsed = primitiveSchema.parse(entry.config);
                            const primitives: CommonConfigPrimitives = commonComponentEnvConfigToConfigPrimitives(configTypeUpper, parsed);
                            const parsedEnvConfigValues = envSchema.env.parse(entry.config);
                            const { data = {}, options = {}, ...rest } = envSchema.toConfig(parsedEnvConfigValues);
                            const transformOptions = transformPresetEnv(configTypeUpper);
                            parsedConfig = {
                                name: `${clientType} - ${entry.source}${entry.pos !== '' ? ` - ${entry.pos}` : ''} `,
                                ...primitives,
                                data,
                                ...rest,
                                source: generateConfigLocation('client', entry),
                                options: {
                                    ...options,
                                    ...(transformOptions ?? {})
                                }
                            };
                        } break;
                        case 'file': {
                            // only file config has a combined array of both source and client configs
                            // 
                            // if configureAs is missing (optional) we assume it is a client
                            // and only skip it if it is explicitly set as a source
                            //
                            if ('configureAs' in entry.config && entry.config.configureAs === 'source') {
                                this.logger.debug(`Skipping ${generateConfigLocation('client', entry)} because it is configured as a Source (configureAs set to 'source')`);
                                continue;
                            }
                            const parsed = await validateClientJson(entry.type, entry.config);
                            parsedConfig = {
                                ...parsed,
                                name: parsed.name ?? parsed.id,
                                source: generateConfigLocation('client', entry)
                            }
                        } break;
                        case 'aio': {
                            // aio entries can also optionally have `configureAs` but it must always be `client`
                            // and we are only including entries from the `clients` array at this point
                            // so there's no need to manually check if `configureAs` is present
                            const parsed = await validateClientAIOJson(entry.type, entry.config)
                            parsedConfig = {
                                ...parsed,
                                name: parsed.name ?? parsed.id,
                                source: generateConfigLocation('client', entry)
                            }
                        } break;
                    }
                } catch (e) {
                    const msg = `Failed to validate ${generateConfigLocation('client', entry)}`;
                    if (e instanceof ZodError) {
                        const prettyError = `${msg}:\n${prettifyError(e)}`
                        this.logger.error(`${msg}:\n${prettifyError(e)}`);
                        this.emitter.emit('configError', prettyError);
                        this.configErrors.push(prettyError);
                    } else {
                        const err = new Error(msg, { cause: e });
                        this.logger.error(new Error(msg, { cause: e }));
                        this.emitter.emit('configError', err);
                        this.configErrors.push(err);
                    }
                    continue;
                }

                const existingById = strongConfigs.find(x => x.id === parsedConfig.id);
                if(undefined !== existingById) {
                    this.logger.error(stripIndents`There are two ${clientType} Sources that have the same ID:
                        ${existingById.source}
                        ${parsedConfig.source}
                        BOTH of these Clients will be disabled to prevent tainting database history. Correct this issue by using a different ID for at least one of them.`);
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
                await this.addClient(clientType, strongConfigs, clientDefaults);
            }
        }
    }
     
    private instantiateClients = async <T extends ClientType>(
        clientType: T,
        strongConfigs: CommonParsedConfig[],
        clientDefaults: ClientDefaults,
        Ctor: new (...args: any[]) => AbstractScrobbleClient,
        buildArgs: (config: ClientTypeConfigMap[T][0], compositeOptions: Record<string, unknown>) => ConstructorParameters<typeof Ctor>,
    ) => {
        for (const s of strongConfigs) {
            try {
                const config = await validateClientJson(clientType, s);
                const compositeOptions = { ...clientDefaults, ...config.options };
                const newClient = new Ctor(...buildArgs(config, compositeOptions));
                newClient.logger.info(`Client added from ${s.source}`);
                this.clients.push(newClient);
            } catch (e) {
                const err = new Error(`${s.source} was not added due to unrecoverable errors`, { cause: e });
                this.logger.error(err);
                this.emitter.emit('instantiateError', err);
                this.instantiateErrors.push(err);
            }
        }
    }

    addClient = async (clientType: ClientType, strongConfigs: CommonParsedConfig[], clientDefaults: ClientDefaults = {}) => {
            switch (clientType) {
                case 'discord': {
                    const DiscordScrobbler = (await import('./DiscordScrobbler.ts')).default;
                    await this.instantiateClients('discord', strongConfigs, clientDefaults, DiscordScrobbler,
                        (config, options) => [config.name ?? config.id, { ...config, options }, {}, this.emitter, this.logger]);
                } break;
                case 'koito': {
                    const KoitoScrobbler = (await import('./KoitoScrobbler.ts')).default;
                    await this.instantiateClients('koito', strongConfigs, clientDefaults, KoitoScrobbler,
                        (config, options) => [config.name ?? config.id, { ...config, options: { ...options, configDir: this.internalConfig.configDir } }, {}, this.emitter, this.logger]);
                } break;
                case 'lastfm': {
                    const LastfmScrobbler = (await import('./LastfmScrobbler.ts')).default;
                    await this.instantiateClients('lastfm', strongConfigs, clientDefaults, LastfmScrobbler,
                        (config, options) => [config.name ?? config.id, { ...config, options }, this.internalConfig, this.emitter, this.logger]);
                } break;
                case 'librefm': {
                    const LibrefmScrobbler = (await import('./LibrefmScrobbler.ts')).default;
                    await this.instantiateClients('librefm', strongConfigs, clientDefaults, LibrefmScrobbler,
                        (config, options) => [config.name ?? config.id, { ...config, options }, this.internalConfig, this.emitter, this.logger]);
                } break;
                case 'listenbrainz': {
                    const ListenbrainzScrobbler = (await import('./ListenbrainzScrobbler.ts')).default;
                    await this.instantiateClients('listenbrainz', strongConfigs, clientDefaults, ListenbrainzScrobbler,
                        (config, options) => [config.name ?? config.id, { ...config, options }, this.internalConfig, this.emitter, this.logger]);
                } break;
                case 'maloja': {
                    const MalojaScrobbler = (await import('./MalojaScrobbler.ts')).default;
                    await this.instantiateClients('maloja', strongConfigs, clientDefaults, MalojaScrobbler,
                        (config, options) => [config.name ?? config.id, { ...config, options }, this.emitter, this.logger]);
                } break;
                case 'rocksky': {
                    const RockskyScrobbler = (await import('./RockskyScrobbler.ts')).default;
                    await this.instantiateClients('rocksky', strongConfigs, clientDefaults, RockskyScrobbler,
                        (config, options) => [config.name ?? config.id, { ...config, options }, this.internalConfig, this.emitter, this.logger]);
                } break;
                case 'tealfm': {
                    const TealScrobbler = (await import('./TealfmScrobbler.ts')).default;
                    await this.instantiateClients('tealfm', strongConfigs, clientDefaults, TealScrobbler,
                        (config, options) => [config.name ?? config.id, { ...config, options }, this.internalConfig, this.emitter, this.logger]);
                } break;
            }
    }

    playingNow = async (data: SourcePlayerObj, options: {scrobbleTo: string[], scrobbleFrom: SourceIdentifier}) => {
        const playObjs = Array.isArray(data) ? data : [data];
        const {
            scrobbleTo = [],
            scrobbleFrom,
        } = options;

        if (this.clients.length === 0) {
            this.logger.trace('Cannot update Now Playing! No clients are configured.');
        }

        const excluded: string[] = [];
        for (const client of this.clients) {
            if(!client.supportsNowPlaying || !client.nowPlayingEnabled) {
                continue;
            }
            if (scrobbleTo.length > 0) {
                // removing whitespace, case-insensitive, and trimming
                const cNameNormal = normalizeStr(client.name, clientScrobbleToNormalization);
                const cUidNormal = normalizeStr(client.getUid(), clientScrobbleToNormalization);
                const name = scrobbleTo.find(x => normalizeStr(x, clientScrobbleToNormalization) === cNameNormal)
                const id = scrobbleTo.find(x => normalizeStr(x, clientScrobbleToNormalization) === cUidNormal);

                if(name === undefined && id === undefined) {
                    excluded.push(client.getUid());
                    continue;
                } else if(name !== undefined && id === undefined && !this.scrobbleToNamesWarnings.includes(`${name}-${scrobbleFrom.type}-${scrobbleFrom.name}`)) {
                    client.logger.warn(stripIndents`Using Client *name* '${name}' in the \`clients\` fields for a Source (${scrobbleFrom}) is DEPRECATED and will be removed in a future release.
                        Replace the *name* with the *id* '${client.getUid()}' of this Client.`);
                    this.scrobbleToNamesWarnings.push(`${name}-${scrobbleFrom}`);
                    
                }
            }
            for (const playObj of playObjs) {
                await client.queuePlayingNow(playObj, scrobbleFrom);
            }
        }
        if(excluded.length > 0) {
            this.logger.trace(`These Now Playing clients were filtered from Source '${scrobbleFrom.type} - ${scrobbleFrom.name}' => ${excluded.join(' | ')}`);
        }
    }

    getPlayingNow = (source: string, scrobbleTo: string[]): PlayObject[] => {
        const playingNow = [];
        for (const client of this.clients) {
            if(!client.supportsNowPlaying || !client.nowPlayingEnabled) {
                continue;
            }
            if (scrobbleTo.length > 0 && !scrobbleTo.includes(client.name)) {
                continue;
            }
            if(client.nowPlayingSourceAllowed(source) && client.nowPlayingLastPlay !== undefined) {
                playingNow.push(client.nowPlayingLastPlay.play);
            }
        }
        return playingNow.filter(x => x !== undefined);
    }

    scrobble = async (data: (PlayObject | PlayObject[]), options: {forceRefresh?: boolean, checkTime?: Dayjs, scrobbleTo?: string[], scrobbleFrom?: string} = {}) => {
        const playObjs = Array.isArray(data) ? data : [data];
        const {
            forceRefresh = false,
            checkTime = dayjs(),
            scrobbleTo = [],
            scrobbleFrom = 'source',
        } = options;

        if (this.clients.length === 0) {
            this.logger.warn('Cannot scrobble! No clients are configured.');
        }

        const excluded: string[] = [];
        for (const client of this.clients) {
            if (scrobbleTo.length > 0) {
                // removing whitespace, case-insensitive, and trimming
                const cNameNormal = normalizeStr(client.name, clientScrobbleToNormalization);
                const cUidNormal = normalizeStr(client.getUid(), clientScrobbleToNormalization);
                const name = scrobbleTo.find(x => normalizeStr(x, clientScrobbleToNormalization) === cNameNormal)
                const id = scrobbleTo.find(x => normalizeStr(x, clientScrobbleToNormalization) === cUidNormal);

                if(name === undefined && id === undefined) {
                    excluded.push(client.getUid());
                    continue;
                } else if(name !== undefined && id === undefined && !this.scrobbleToNamesWarnings.includes(`${name}-${scrobbleFrom}`)) {
                    client.logger.warn(stripIndents`Using Client *name* '${name}' in the \`clients\` fields for a Source (${scrobbleFrom}) is DEPRECATED and will be removed in a future release.
                        Replace the *name* with the *id* '${client.getUid()}' of this Client.`);
                    this.scrobbleToNamesWarnings.push(`${name}-${scrobbleFrom}`);
                    
                }
            }
            for (const playObj of playObjs) {
                await client.queueScrobble(clone(playObj), scrobbleFrom);
            }
        }
        if(excluded.length > 0) {
            this.logger.trace(`These clients were filtered from scrobbling from Source '${scrobbleFrom}' => ${excluded.join(' | ')}`);
        }
    }
}