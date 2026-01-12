/* eslint-disable no-case-declarations */
import { childLogger, Logger } from '@foxxmd/logging';
import dayjs, { Dayjs } from "dayjs";
import { PlayObject, SourcePlayerObj } from "../../core/Atomic.js";
import { ClientType, clientTypes, ConfigMeta, InternalConfig, InternalConfigOptional, isClientType, REPORTED_PLAYER_STATUSES, SourceIdentifier } from "../common/infrastructure/Atomic.js";
import { AIOConfig } from "../common/infrastructure/config/aioConfig.js";
import { ClientAIOConfig, ClientConfig } from "../common/infrastructure/config/client/clients.js";
import { LastfmClientConfig } from "../common/infrastructure/config/client/lastfm.js";
import { ListenBrainzClientConfig } from "../common/infrastructure/config/client/listenbrainz.js";
import { MalojaClientConfig } from "../common/infrastructure/config/client/maloja.js";
import { WildcardEmitter } from "../common/WildcardEmitter.js";
import { Notifiers } from "../notifier/Notifiers.js";
import { isDebugMode, parseBool } from "../utils.js";
import { readJson } from '../utils/DataUtils.js';
import { joinedUrl } from "../utils/NetworkUtils.js";
import { getTypeSchemaFromConfigGenerator } from "../utils/SchemaUtils.js";
import { validateJson } from "../utils/ValidationUtils.js";
import AbstractScrobbleClient from "./AbstractScrobbleClient.js";
import LastfmScrobbler from "./LastfmScrobbler.js";
import ListenbrainzScrobbler from "./ListenbrainzScrobbler.js";
import MalojaScrobbler from "./MalojaScrobbler.js";
import { Definition } from 'ts-json-schema-generator';
import KoitoScrobbler from './KoitoScrobbler.js';
import { KoitoClientConfig } from '../common/infrastructure/config/client/koito.js';
import TealScrobbler from './TealfmScrobbler.js';
import { TealClientConfig } from '../common/infrastructure/config/client/tealfm.js';
import RockskyScrobbler from './RockskyScrobbler.js';
import { RockSkyClientConfig } from '../common/infrastructure/config/client/rocksky.js';
import { CommonClientOptions } from '../common/infrastructure/config/client/index.js';
import { ExternalMetadataTerm, PlayTransformHooks } from '../common/infrastructure/Transform.js';
import LibrefmScrobbler from './LibrefmScrobbler.js';
import { LibrefmClientConfig } from '../common/infrastructure/config/client/librefm.js';

type groupedNamedConfigs = {[key: string]: ParsedConfig[]};

type ParsedConfig = ClientAIOConfig & ConfigMeta;

export default class ScrobbleClients {

    /** @type AbstractScrobbleClient[] */
    clients: (MalojaScrobbler | LastfmScrobbler | KoitoScrobbler | TealScrobbler)[] = [];
    logger: Logger;

    internalConfig: InternalConfig;

    private schemaDefinitions: Record<string, Definition> = {};

    emitter: WildcardEmitter;

    sourceEmitter: WildcardEmitter;

    constructor(emitter: WildcardEmitter, sourceEmitter: WildcardEmitter, internal: InternalConfigOptional, parentLogger: Logger) {
        this.emitter = emitter;
        this.sourceEmitter = sourceEmitter;
        this.logger = childLogger(parentLogger, 'Scrobblers'); // winston.loggers.get('app').child({labels: ['Scrobblers']}, mergeArr);
        this.internalConfig = {
            ...internal,
            logger: this.logger
        }

        this.sourceEmitter.on('playerUpdate', async (payload: { data: SourcePlayerObj & { options: { scrobbleTo: string[] } }} & SourceIdentifier) => {
            // agressively update Now Playing so scrobblers that display based on duration are mostly synced
            // but aggressively *stop* updating if state becomes stale/orphaned
            if(payload.data.status.reported === REPORTED_PLAYER_STATUSES.playing && (!payload.data.status.stale && !payload.data.status.orphaned)) {
                this.playingNow(payload.data.play, {...payload.data.options, scrobbleFrom: { type: payload.type, name: payload.name}});
            }
        });

        this.sourceEmitter.on('discoveredToScrobble', async (payload: { data: (PlayObject | PlayObject[]), options: { forceRefresh?: boolean, checkTime?: Dayjs, scrobbleTo?: string[], scrobbleFrom?: string } }) => {
            await this.scrobble(payload.data, payload.options);
        });
    }

    getByName = (name: any) => this.clients.find(x => x.name === name)

    getByType = (type: any) => this.clients.filter(x => x.type === type)

    getByNameAndType = (name: string, type: ClientType) => this.clients.find(x => x.name === name && x.type === type)

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

    private getSchemaByType = (type: ClientType): Definition => {
        if(this.schemaDefinitions[type] === undefined) {
            switch(type) {
                case 'maloja':
                    this.schemaDefinitions[type] = getTypeSchemaFromConfigGenerator("MalojaClientConfig");
                    break;
                case 'lastfm':
                    this.schemaDefinitions[type] = getTypeSchemaFromConfigGenerator("LastfmClientConfig");
                    break;
                case 'librefm':
                    this.schemaDefinitions[type] = getTypeSchemaFromConfigGenerator("LibrefmClientConfig");
                    break;
                case 'listenbrainz':
                    this.schemaDefinitions[type] = getTypeSchemaFromConfigGenerator("ListenBrainzClientConfig");
                    break;
                case 'koito':
                    this.schemaDefinitions[type] = getTypeSchemaFromConfigGenerator("KoitoClientConfig");
                    break;
                case 'tealfm':
                    this.schemaDefinitions[type] = getTypeSchemaFromConfigGenerator("TealClientConfig");
                    break;
                case 'rocksky':
                    this.schemaDefinitions[type] = getTypeSchemaFromConfigGenerator("RockSkyClientConfig");
                    break;
            }
        }
        return this.schemaDefinitions[type];
    }

    buildClientsFromConfig = async (notifier: Notifiers) => {
        const configs: ParsedConfig[] = [];

        let configFile;
        try {
            configFile = await readJson(`${this.internalConfig.configDir}/config.json`, {throwOnNotFound: false, logger: childLogger(this.logger, `Secrets`)});
        } catch (e) {
            // think this should stay as show-stopper since config could include important defaults (delay, retries) we don't want to ignore
            throw new Error('config.json could not be parsed');
        }

        const relaxedSchema = getTypeSchemaFromConfigGenerator("AIOClientRelaxedConfig");

        let clientDefaults = {};
        if (configFile !== undefined) {
            const aioConfig = validateJson<AIOConfig>(configFile, relaxedSchema, this.logger);
            const {
                clients: mainConfigClientConfigs = [],
                clientDefaults: cd = {},
            } = aioConfig;
            clientDefaults = cd;
            for (const [index, c] of mainConfigClientConfigs.entries()) {
                const {name = 'unnamed'} = c;
                if(c.type === undefined) {
                    const invalidMsgType = `Client config ${index + 1} (${name}) in config.json does not have a "type" property! "type": "[clientType]" must be one of ${clientTypes.join(' | ')}`;
                    this.logger.error(invalidMsgType);
                    continue;
                }
                if(!isClientType(c.type.toLocaleLowerCase())) {
                    const invalidTypeMsg = `Client config ${index + 1} (${name}) in config.json has an invalid client type of '${c.type}'. Must be one of ${clientTypes.join(' | ')}`;
                    //this.emitter.emit('error', new Error(invalidTypeMsg));
                    this.logger.error(invalidTypeMsg);
                    continue;
                }
                if(c.configureAs === 'source') {
                       this.logger.debug(`Skipping config ${index + 1} (${name}) in config.json because it is configured as a source.`);
                       continue;
                }
                try {
                    validateJson<AIOConfig>(c, this.getSchemaByType(c.type.toLocaleLowerCase() as ClientType), this.logger);
                } catch (e) {
                    const err = new Error(`Client config ${index + 1} (${c.type} - ${name}) in config.json is invalid and will not be used.`, {cause: e});
                    this.emitter.emit('error', err);
                    this.logger.error(err);
                    continue;
                }
                configs.push({...c,
                    name,
                    source: 'config.json',
                    configureAs: 'client', //override user value
                });
            }
        }

        for (const clientType of clientTypes) {
            const defaultConfigureAs = 'client';
            switch (clientType) {
                case 'maloja':
                    // env builder for single user mode
                    const url = process.env.MALOJA_URL;
                    const apiKey = process.env.MALOJA_API_KEY;
                    if (url !== undefined || apiKey !== undefined) {
                        configs.push({
                            type: 'maloja',
                            name: 'unnamed-mlj',
                            source: 'ENV',
                            mode: 'single',
                            configureAs: 'client',
                            data: {
                                url,
                                apiKey
                            },
                            options: transformPresetEnv('MALOJA')
                        })
                    }
                    break;
                case 'lastfm':
                    const lfm = {
                        apiKey: process.env.LASTFM_API_KEY,
                        secret: process.env.LASTFM_SECRET,
                        redirectUri: process.env.LASTFM_REDIRECT_URI,
                        session: process.env.LASTFM_SESSION,
                        librefm: process.env.LASTFM_LIBREFM_MODE !== undefined ? parseBool(process.env.LASTFM_LIBREFM_MODE, undefined) : undefined,
                        host: process.env.LASTFM_HOST,
                        path: process.env. LASTFM_PORT
                    };
                    if (!Object.values(lfm).every(x => x === undefined)) {
                        configs.push({
                            type: 'lastfm',
                            name: 'unnamed-lfm',
                            source: 'ENV',
                            mode: 'single',
                            configureAs: 'client',
                            data: lfm,
                            options: transformPresetEnv('LASTFM')
                        })
                    }
                    break;
                case 'librefm': {
                    const libre = {
                        apiKey: process.env.LIBREFM_API_KEY,
                        secret: process.env.LIBREFM_SECRET,
                        redirectUri: process.env.LIBREFM_REDIRECT_URI,
                        session: process.env.LIBREFM_SESSION,
                        urlBase: process.env.LIBREFM_URLBASE,
                    };
                    if (!Object.values(libre).every(x => x === undefined)) {
                        configs.push({
                            type: 'librefm',
                            name: 'unnamed-librefm',
                            source: 'ENV',
                            mode: 'single',
                            configureAs: 'client',
                            data: lfm,
                            options: transformPresetEnv('LIBREFM')
                        })
                    }
                }    break;
                case 'listenbrainz':
                    const lz = {
                        url: process.env.LZ_URL,
                        token: process.env.LZ_TOKEN,
                        username: process.env.LZ_USER
                    };
                    if (!Object.values(lz).every(x => x === undefined)) {
                        configs.push({
                            type: 'listenbrainz',
                            name: 'unnamed-lz',
                            source: 'ENV',
                            mode: 'single',
                            configureAs: 'client',
                            data: lz,
                            options: transformPresetEnv('LZ')
                        })
                    }
                    break;
                case 'koito':
                    const koit = {
                        url: process.env.KOITO_URL,
                        token: process.env.KOITO_TOKEN,
                        username: process.env.KOITO_USER
                    };
                    if (!Object.values(koit).every(x => x === undefined)) {
                        configs.push({
                            type: 'koito',
                            name: 'unnamed-koito',
                            source: 'ENV',
                            mode: 'single',
                            configureAs: 'client',
                            data: koit,
                            options: transformPresetEnv('KOITO')
                        })
                    }
                    break;
                case 'tealfm':
                    const teal = {
                        identifier: process.env.TEALFM_IDENTIFIER,
                        appPassword: process.env.TEALFM_APP_PW,
                        pds: process.env.TEALFM_PDS
                    };
                    if (!Object.values(teal).every(x => x === undefined)) {
                        configs.push({
                            type: 'tealfm',
                            name: 'unnamed-tealfm',
                            source: 'ENV',
                            mode: 'single',
                            configureAs: 'client',
                            data: teal,
                            options: transformPresetEnv('TEALFM')
                        })
                    }
                    break;
                case 'rocksky':
                    const rocksky = {
                        key: process.env.ROCKSKY_KEY,
                        handle: process.env.ROCKSKY_HANDLE
                    };
                    if (!Object.values(rocksky).every(x => x === undefined)) {
                        configs.push({
                            type: 'rocksky',
                            name: 'unnamed-rocksky',
                            source: 'ENV',
                            mode: 'single',
                            configureAs: 'client',
                            data: rocksky,
                            options: transformPresetEnv('ROCKSKY')
                        })
                    }
                    break;
                default:
                    break;
            }
            let rawClientConfigs;
            try {
                rawClientConfigs = await readJson(`${this.internalConfig.configDir}/${clientType}.json`, {throwOnNotFound: false, logger: childLogger(this.logger, `${clientType} Secrets`)});
            } catch (e) {
                const errMsg = `${clientType}.json config file could not be parsed`;
                this.emitter.emit('error', errMsg);
                this.logger.error(errMsg);
                continue;
            }
            if (rawClientConfigs !== undefined) {
                let clientConfigs: ParsedConfig[] = [];
                if (Array.isArray(rawClientConfigs)) {
                    clientConfigs = rawClientConfigs;
                } else if(rawClientConfigs === null) {
                    this.logger.error(`${clientType}.json contained no data`);
                    continue;
                } else if(typeof rawClientConfigs === 'object') {
                    clientConfigs = [rawClientConfigs];
                } else {
                    this.logger.error(`All top level data from ${clientType}.json must be an object or an array of objects, will not parse configs from file`);
                    continue;
                }
                for(const [i,rawConf] of rawClientConfigs.entries()) {
                    if(rawConf.configureAs === 'source') 
                    {
                        this.logger.debug(`Skipping config ${i + 1} from ${clientType}.json because it is configured as a source.`);
                       continue;
                    }
                    try {
                        const validConfig = validateJson<ClientConfig>(rawConf, this.getSchemaByType(clientType), this.logger);
                        const {configureAs = defaultConfigureAs} = validConfig;
                        if (configureAs === 'client') {
                            const parsedConfig: ParsedConfig = {
                                ...rawConf,
                                source: `${clientType}.json`,
                                type: clientType
                            }
                            configs.push(parsedConfig);
                        }
                    } catch (e: any) {
                        const configErr = new Error(`The config entry at index ${i} from ${clientType}.json was not valid`, {cause: e});
                        this.emitter.emit('error', configErr);
                        this.logger.error(configErr);
                    }
                }
            }
        }

        // all client configs are minimally valid
        // now check that names are unique
        const nameGroupedConfigs = configs.reduce((acc: groupedNamedConfigs, curr: ParsedConfig) => {
            const {name = 'unnamed'} = curr;
            const {[name]: n = []} = acc;
            return {...acc, [name]: [...n, curr]};
        }, {});
        let noConflictConfigs: ParsedConfig[] = [];
        for (const [name, configs] of Object.entries(nameGroupedConfigs)) {
            if (configs.length > 1) {
                const sources = configs.map((c: any) => `Config object from ${c.source} of type [${c.type}]`);
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
        const finalConfigs: ParsedConfig[] = noConflictConfigs.map(({name = 'unnamed', ...x}) => ({
            ...x,
            name
        }));
        for (const c of finalConfigs) {
            try {
                await this.addClient(c, clientDefaults, notifier);
            } catch(e) {
                const addError = new Error(`Client ${c.name} from ${c.source} was not added because it had unrecoverable errors`, {cause: e});
                this.emitter.emit('error', addError);
                this.logger.error(addError);
            }
        }
    }

    addClient = async (clientConfig: ParsedConfig, defaults = {}, notifier: Notifiers) => {
/*        const isValidConfig = isValidConfigStructure(clientConfig, {name: true, data: true, type: true});
        if (isValidConfig !== true) {
            throw new Error(`Config object from ${clientConfig.source || 'unknown'} with name [${clientConfig.name || 'unnamed'}] of type [${clientConfig.type || 'unknown'}] has errors: ${isValidConfig.join(' | ')}`)
        }*/
        const {type, name, enable = true, source, data: d = {}} = clientConfig;

        if(enable === false) {
            this.logger.warn({labels: [`${type} - ${name}`]}, `Client from ${source} was disabled by config`);
            return;
        }

        // add defaults
        const data = {...defaults, ...d};
        let newClient;
        this.logger.debug({labels: [`${type} - ${name}`]}, `Constructing Client from ${source}`);
        switch (type) {
            case 'maloja':
                newClient = new MalojaScrobbler(name, ({...clientConfig, data} as unknown as MalojaClientConfig), notifier, this.emitter, this.logger);
                break;
            case 'lastfm':
                newClient = new LastfmScrobbler(name, {...clientConfig, data } as unknown as LastfmClientConfig, this.internalConfig, notifier, this.emitter, this.logger);
                break;
            case 'librefm':
                newClient = new LibrefmScrobbler(name, {...clientConfig, data } as unknown as LibrefmClientConfig, this.internalConfig, notifier, this.emitter, this.logger);
                break;
            case 'listenbrainz':
                newClient = new ListenbrainzScrobbler(name, {...clientConfig, data: {configDir: this.internalConfig.configDir, ...data} } as unknown as ListenBrainzClientConfig, {}, notifier, this.emitter, this.logger);
                break;
            case 'koito':
                newClient = new KoitoScrobbler(name, {...clientConfig, data: {configDir: this.internalConfig.configDir, ...data} } as unknown as KoitoClientConfig, {}, notifier, this.emitter, this.logger);
                break;
            case 'tealfm':
                newClient = new TealScrobbler(name, {...clientConfig, data: {...data}} as unknown as TealClientConfig, {}, notifier, this.emitter, this.logger);
                break;
            case 'rocksky':
                newClient = new RockskyScrobbler(name, {...clientConfig, data: {configDir: this.internalConfig.configDir, ...data} } as unknown as RockSkyClientConfig, {}, notifier, this.emitter, this.logger);
                break;
            default:
                break;
        }

        if(newClient === undefined) {
            // really shouldn't get here!
            throw new Error(`Client of type ${type} from ${source} was not recognized??`);
        }
        newClient.logger.info(`Client Added from ${source}`);
        this.clients.push(newClient);
    }

    playingNow = async (data: (PlayObject | PlayObject[]), options: {scrobbleTo: string[], scrobbleFrom: SourceIdentifier}) => {
        const playObjs = Array.isArray(data) ? data : [data];
        const {
            scrobbleTo = [],
            scrobbleFrom,
        } = options;

        if (this.clients.length === 0) {
            this.logger.warn('Cannot update Now Playing! No clients are configured.');
        }

        for (const client of this.clients) {
            if(!client.supportsNowPlaying || !client.nowPlayingEnabled) {
                continue;
            }
            if (scrobbleTo.length > 0 && !scrobbleTo.includes(client.name)) {
                if(isDebugMode()) {
                    client.logger.debug(`Client was filtered out by Source '${scrobbleFrom.type} - ${scrobbleFrom.name}'`);
                }
                continue;
            }
            for (const playObj of playObjs) {
                client.queuePlayingNow(playObj, scrobbleFrom);
            }
        }
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

        for (const client of this.clients) {
            if (scrobbleTo.length > 0 && !scrobbleTo.includes(client.name)) {
                client.logger.debug(`Client was filtered out by Source '${scrobbleFrom}'`);
                continue;
            }
            for (const playObj of playObjs) {
                await client.queueScrobble(playObj, scrobbleFrom);
            }
        }
    }
}

const transformPresetEnv = <T extends CommonClientOptions = CommonClientOptions>(prefix: string, existing: T = undefined): undefined | T => {

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
