import { RockskyClient } from "@rocksky/sdk";
import { RateLimiterMemory, type IRateLimiterOptions, RateLimiterQueue } from "rate-limiter-flexible";
import { loggerNoop } from "../../MaybeLogger.ts";
import type { Logger } from "@foxxmd/logging";

interface RockskyClientWrappedOptions {
    rate?: Partial<IRateLimiterOptions>
    logger?: Logger
}

// https://stackoverflow.com/a/62561508
type Append<I, T extends unknown[]> = [...T, I]
type WrappedConstructorArgs = Append<RockskyClientWrappedOptions, ConstructorParameters<typeof RockskyClient>>;

export class RockskyClientWrapped extends RockskyClient {

    public rateLimiterQueue: RateLimiterQueue;
    protected logger: Logger;

    constructor(...args: WrappedConstructorArgs) {
        const [view, token, wrappedOpts] = args;
        super(view, token);
        const {
            rate: {
                points = 1,
                duration = 1
            } = {},
            logger = loggerNoop
        } = wrappedOpts;

        this.logger = logger;
        this.rateLimiterQueue = new RateLimiterQueue(new RateLimiterMemory({ points, duration }), { maxQueueSize: 20 });
    }

    async matchSong(...args: Parameters<RockskyClient['matchSong']>): ReturnType<RockskyClient['matchSong']> {

        const remainingTokens = await this.rateLimiterQueue.removeTokens(1);
        this.logger.trace(`Rate Tokens => Used 1 | Remaining ${remainingTokens}`);

        return super.matchSong(...args);
    }

    async search(...args: Parameters<RockskyClient['search']>): ReturnType<RockskyClient['search']> {

        const remainingTokens = await this.rateLimiterQueue.removeTokens(1);
        this.logger.trace(`Rate Tokens => Used 1 | Remaining ${remainingTokens}`);

        return super.search(...args);
    }
}

export type RockskySingletonMap = Map<string, RockskyClientWrapped>;