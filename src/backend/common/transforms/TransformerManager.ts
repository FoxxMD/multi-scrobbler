import { childLogger, Logger } from "@foxxmd/logging";
import AbstractTransformer from "./AbstractTransformer.js";
import { TransformerCommonConfig } from "../../../core/Atomic.js";
import UserTransformer from "./UserTransformer.js";
import { StageConfig } from "../infrastructure/Transform.js";
import { PlayObject } from "../../../core/Atomic.js";
import { isStageTyped } from "../../utils/PlayTransformUtils.js";
import { MSCache } from "../Cache.js";
import NativeTransformer from "./NativeTransformer.js";
import { MusicbrainzApiClient } from "../vendor/musicbrainz/MusicbrainzApiClient.js";
import { MUSICBRAINZ_URL, MusicbrainzApiConfigData } from "../infrastructure/Atomic.js";
import { normalizeWebAddress } from "../../utils/NetworkUtils.js";
import { MusicBrainzApi } from "musicbrainz-api";
import MusicbrainzTransformer, { MusicbrainzTransformerConfig } from "./MusicbrainzTransformer.js";

export default class TransformerManager {

    protected logger: Logger;
    protected parentLogger: Logger;
    protected transformers: Map<string, AbstractTransformer[]> = new Map();
    protected cache: MSCache;

    public constructor(logger: Logger, cache: MSCache) {
        this.logger = childLogger(logger, 'Transformer Manager');
        this.parentLogger = logger;
        this.cache = cache;
    }

    public register(config: TransformerCommonConfig): void {
        let transformers: AbstractTransformer[] = [];
        if (!this.transformers.has(config.type)) {
            this.transformers.set(config.type, []);
        } else {
            transformers = this.transformers.get(config.type);
        }

        if (config.name !== undefined && transformers.some(x => x.config.name === config.name)) {
            throw new Error(`Cannot register ${config.type} transformer with name '${config.name}' because an existing transformer already has that name`);
        }
        const tName = config.name ?? `unnamed-${transformers.length + 1}`;

        this.logger.verbose(`Registering ${config.type} transformer with name '${tName}'`);

        let t: AbstractTransformer;
        switch (config.type) {
            case 'user':
                t = new UserTransformer({ name: tName, ...config }, {logger: this.parentLogger, regexCache: this.cache.regexCache, cache: this.cache.cacheTransform});
                break;
            case 'native':
                t = new NativeTransformer({ name: tName,  ...config }, {logger: this.parentLogger, regexCache: this.cache.regexCache, cache: this.cache.cacheTransform});
                break;
            case 'musicbrainz':
                t = new MusicbrainzTransformer({ name: tName, ...config as MusicbrainzTransformerConfig }, {logger: this.parentLogger, regexCache: this.cache.regexCache, cache: this.cache.cacheTransform});
                break;
            default:
                throw new Error(`No transformer of type '${config.type}' exists.`);
        }
        this.transformers.set(config.type, [...transformers, t]);
        this.logger.verbose(`${config.type} transformer with name '${tName}' registered`);        
    }

    public async initTransformers() {
        this.logger.verbose('Initializing transformers...');
        for (const list of this.transformers.values()) {
            for (const transformer of list) {
                if (!transformer.isReady()) {
                    if (!transformer.canAuthUnattended()) {
                        transformer.logger.warn({ label: 'Heartbeat' }, 'Transformer is not ready but will not try to initialize because auth state is not good and cannot be correct unattended.');
                    }
                    try {
                        await transformer.tryInitialize({ force: false, notify: true, notifyTitle: 'Could not initialize automatically' });
                    } catch (e) {
                        transformer.logger.error(new Error('Could not initialize source automatically', { cause: e }));
                    }
                }
            }
        }
        this.logger.verbose('Done initializing transformers');
    }

    public hasTransformerType(type: string): boolean {
        return this.transformers.has(type);
    }

    protected getTransformerByStage(data: StageConfig): AbstractTransformer {
        const list = this.transformers.get(data.type);
        if (list === undefined || list.length === 0) {
            throw new Error(`No transformer of type '${data.type}' is registered.`);
        }

        if (list.length > 1 && (data as any).name === undefined) {
            this.logger.warn(`More than one '${data.type}' transformer but name was not specified, using first registered`);
            return list[0];
        } else {
            return list[0]
        }
    }

    public parseTransformerConfig(data: any) {
        if (!isStageTyped(data)) {
            throw new Error(`Must be an object with a 'type' property.`);
        }
        const t = this.getTransformerByStage(data);
        return t.parseConfig(data);
    }

    public async handleStage(data: StageConfig, play: PlayObject): Promise<PlayObject> {
        const list = this.transformers.get(data.type);
        if (list === undefined || list.length === 0) {
            throw new Error(`No transformer of type '${data.type}' is registered.`);
        }

        let t: AbstractTransformer;
        if (list.length > 0 && (data as any).name === undefined) {
            this.logger.warn(`More than one '${data.type}' transformer but name was not specified, using first registered`);
            t = list[0];
        } else {
            t = list[0];
        }

        try {
            return await t.handle(data, play);
        } catch (e) {
            throw new Error('Stage processing failed', {cause: e});
        }
    }
}