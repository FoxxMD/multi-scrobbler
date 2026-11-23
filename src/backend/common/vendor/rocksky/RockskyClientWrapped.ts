import { RockskyClient, RockskyError } from "@rocksky/sdk";
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

        const [title, artist, mbId, isrc, album] = args;
        if(album === undefined) {
            return super.matchSong(...args);
        }
        // album is a hard filter since sdk 0.18, so retry without it to still match a differently named edition of the album
        try {
            const res = await super.matchSong(...args);
            if((res.matches ?? []).length > 0) {
                return res;
            }
        } catch (e) {
            if(!(e instanceof RockskyError && e.kind === 'NotFound')) {
                throw e;
            }
        }
        this.logger.debug(`No match with album '${album}', retrying without album`);
        return this.matchSong(title, artist, mbId, isrc);
    }

    async song(...args: Parameters<RockskyClient['song']>): ReturnType<RockskyClient['song']> {

        const remainingTokens = await this.rateLimiterQueue.removeTokens(1);
        this.logger.trace(`Rate Tokens => Used 1 | Remaining ${remainingTokens}`);

        return super.song(...args);
    }

    async search(...args: Parameters<RockskyClient['search']>): ReturnType<RockskyClient['search']> {

        const remainingTokens = await this.rateLimiterQueue.removeTokens(1);
        this.logger.trace(`Rate Tokens => Used 1 | Remaining ${remainingTokens}`);

        return super.search(...args);
    }
}

export type RockskySingletonMap = Map<string, RockskyClientWrapped>;