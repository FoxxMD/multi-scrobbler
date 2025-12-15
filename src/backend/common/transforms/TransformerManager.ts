import { childLogger, Logger } from "@foxxmd/logging";
import AbstractTransformer from "./AbstractTransformer.js";
import { TransformerCommonConfig } from "../../../core/Atomic.js";
import UserTransformer from "./UserTransformer.js";
import { StageConfig } from "../infrastructure/Transform.js";
import { PlayObject } from "../../../core/Atomic.js";
import { isStageTyped } from "../../utils/PlayTransformUtils.js";
import { MSCache } from "../Cache.js";
import NativeTransformer from "./NativeTransformer.js";
import MusicbrainzTransformer, { configFromEnv, MusicbrainzTransformerConfig } from "./MusicbrainzTransformer.js";
import { AsyncLocalStorage } from 'node:async_hooks';
import { nanoid } from "nanoid";
import { SimpleError, StageTransformError } from "../errors/MSErrors.js";

export default class TransformerManager {

    protected logger: Logger;
    protected parentLogger: Logger;
    protected transformers: Map<string, AbstractTransformer[]> = new Map();
    protected cache: MSCache;
    protected asyncStore: AsyncLocalStorage<string>;

    public constructor(logger: Logger, cache: MSCache) {
        this.logger = childLogger(logger, 'Transformer Manager');
        this.parentLogger = logger;
        this.cache = cache;
        this.asyncStore = new AsyncLocalStorage();
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

        const tLogger = childLogger(this.parentLogger, ['Transformer', () => this.asyncStore.getStore() ?? undefined]);

        let t: AbstractTransformer;
        switch (config.type) {
            case 'user':
                t = new UserTransformer({ name: tName, ...config }, {logger: tLogger, regexCache: this.cache.regexCache, cache: this.cache.cacheTransform});
                break;
            case 'native':
                t = new NativeTransformer({ name: tName,  ...config }, {logger: tLogger, regexCache: this.cache.regexCache, cache: this.cache.cacheTransform});
                break;
            case 'musicbrainz':
                t = new MusicbrainzTransformer({ name: tName, ...config as MusicbrainzTransformerConfig }, {logger: tLogger, regexCache: this.cache.regexCache, cache: this.cache.cacheTransform});
                break;
            default:
                throw new Error(`No transformer of type '${config.type}' exists.`);
        }
        this.transformers.set(config.type, [...transformers, t]);
        this.logger.verbose(`${config.type} transformer with name '${tName}' registered`);        
    }

    public async registeryDefaults() {
        if(!this.hasTransformerType('user')) {
            this.register({type: 'user', name: 'MSDefault'});
        }
        if(!this.hasTransformerType('native')) {
            this.register({type: 'native', name: 'MSDefault'});
        }
    }

    public async registerFromEnv() {
        try {
            const mbConfig = configFromEnv(this.logger);
            if(mbConfig !== undefined) {
                this.register(mbConfig);
            } else {
                this.logger.debug('No transformers to build from ENV');
            }
        } catch (e) {
            if(e instanceof SimpleError) {
                this.logger.error(`Unable to build Musicbrainz Transformer from ENV: ${e.message}`);
            }
            this.logger.error(new Error('Unable to build Musicbrainz Transformer from ENV', {cause: e}));
        }
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

    public async handleStage(data: StageConfig, play: PlayObject, asyncId: string = nanoid(6)): Promise<[PlayObject, string]> {
        const list = this.transformers.get(data.type);
        if (list === undefined || list.length === 0) {
            throw new Error(`No transformer of type '${data.type}' is registered.`);
        }

        let t: AbstractTransformer;
        if (list.length > 1) {
            if(data.name === undefined) {
                this.logger.warn(`More than one '${data.type}' transformer but name was not specified, using first registered`);
                t = list[0];
            } else {
               const named = list.find(x => x.name === data.name);
               if(named === undefined) {
                throw new Error(`No ${data.type} transformer with name '${data.name}'`)
               }
               t = named;
            }
        } else {
            t = list[0];
        }

        try {
            const transformedPlay = await this.asyncStore.run(asyncId, async () => {
                return await t.handle(data, play);
            });
            return [transformedPlay, t.name];
        } catch (e) {
            throw new StageTransformError(t.name, 'Stage processing stopped early', {cause: e});
        }
    }
}