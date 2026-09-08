import type { AsyncLocalStorage } from "async_hooks";
import { MusicBrainzApi } from "musicbrainz-api";
import { RateLimiterMemory, RateLimiterQueue, type IRateLimiterOptions } from 'rate-limiter-flexible';
import { sleep } from "../../../utils.ts";
import { SimpleError } from "../../errors/MSErrors.ts";
import { UpstreamError } from "../../errors/UpstreamError.ts";
import { hasNodeNetworkException } from "../../errors/NodeErrors.ts";
import { childLogger, type Logger } from "@foxxmd/logging";
import { loggerNoop } from "../../MaybeLogger.ts";


type MusicbrainzApiWrappedOptions  = ConstructorParameters<typeof MusicBrainzApi>[0] & {
    rate?: Partial<IRateLimiterOptions>
    hostname: string
    asyncStore: AsyncLocalStorage<string>
    logger?: Logger
};

export class MusicbrainzApiWrapped extends MusicBrainzApi {
    public rateLimiterQueue: RateLimiterQueue;
    protected asyncStore: AsyncLocalStorage<string>;
    public hostname: string;
    logger: Logger;

    constructor(config?: MusicbrainzApiWrappedOptions) {
        const {
            rate: {
                points = 1,
                duration = 1
            } = {},
            hostname,
            asyncStore,
            logger = loggerNoop
        } = config;
        super(config);
        this.rateLimiterQueue = new RateLimiterQueue(new RateLimiterMemory({points, duration}), {maxQueueSize: 20});
        this.asyncStore = asyncStore;
        this.hostname = hostname;
        this.logger = childLogger(logger, [`${hostname} Client`]);
    }

    public async callApi<T = Response>(func: (mb: MusicBrainzApi) => Promise<any>, options?: { timeout?: number, cacheKey?: string }): Promise<T> {
        const {
            timeout = 30000,
            cacheKey
        } = options || {};

        const remainingTokens = await this.rateLimiterQueue.removeTokens(1);

        this.logger.trace(`Rate Tokens => Used 1 | Remaining ${remainingTokens}`);

        try {
            const res = await this.asyncStore.run(cacheKey, async () => {
                return await Promise.race([
                    func(this),
                    sleep(timeout)
                ]);
            });
            if (res === undefined) {
                throw new SimpleError(`[${this.hostname}] Timeout occurred while waiting for Musicbrainz API rate limit`);
            }
            if(`error` in res) {
                throw new Error(res.error);
            }
            return res as T;
        } catch (e) {
            if(e instanceof SimpleError) {
                throw e;
            }
            if(e.name === 'TimeoutError') {
                throw new UpstreamError(`[${this.hostname}] Network error: timeout triggered while waiting for response from API`,{cause: e, showStopper: true});
            }
            if(hasNodeNetworkException(e)) {
                throw new UpstreamError(`[${this.hostname}] Network error occurred`, {cause: e, showStopper: true})
            }
            throw new UpstreamError(`[${this.hostname}] Error occurred in Musicbrainz API`, { cause: e, showStopper: false });
        }
    };
}