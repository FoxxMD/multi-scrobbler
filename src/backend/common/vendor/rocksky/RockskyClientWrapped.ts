import { RockskyClient } from "@rocksky/sdk";
import { RateLimiterMemory, type IRateLimiterOptions, RateLimiterQueue } from "rate-limiter-flexible";
import { loggerNoop } from "../../MaybeLogger.ts";
import type { Logger } from "@foxxmd/logging";
import AbstractApiClient from "../AbstractApiClient.ts";
import { ROCKSKY_URL, type RockskyApiClientConfig } from "./interfaces.ts";
import type { Cacheable } from "cacheable";
import type { AbstractApiOptions } from "../../infrastructure/Atomic.ts";
import { getRoot } from "../../../ioc.ts";
import { type CircuitBreakerProxy, ProxyWithCircuitBreaker } from "@foxxmd/load-balancer-proxy";
import { maxRequestsPerSecond, normalizeWebAddress } from "../../../utils/NetworkUtils.ts";
import { formatNumber } from "../../../../core/DataUtils.ts";
import { ConsecutiveBreaker } from "cockatiel";
import { SimpleError } from "../../errors/MSErrors.ts";

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
}

export type RockskySingletonMap = Map<string, RockskyClientWrapped>;

export class RockskyClientPool extends AbstractApiClient {
    declare config: RockskyApiClientConfig;
    public rsProxy: CircuitBreakerProxy<RockskyClientWrapped>
    cache: Cacheable;

    constructor(name: any, config: RockskyApiClientConfig, options: AbstractApiOptions & { cache?: Cacheable }) {
        super('Rocksky API', name, config, options);
        this.cache = options.cache ?? getRoot().items.cache().cacheApi;

        const rsMap = getRoot().items.rsMap();

        const apis: RockskyClientWrapped[] = [];
        const hosts: string[] = [];
        for (const rsConfig of this.config.apis) {
            if ((rsConfig.enable ?? true) === false) {
                this.logger.verbose(`Not using config for ${rsConfig.url ?? ROCKSKY_URL} because it is disabled`);
                continue;
            }
            const {
                rate = {},
                url
            } = rsConfig;
            const u = normalizeWebAddress((url ?? ROCKSKY_URL).toLocaleLowerCase());
            hosts.push(u.url.hostname);
            const rs = rsMap.get(u.url.hostname);
            let points: number,
                duration: number;
            if (rs === undefined) {
                switch (u.url.hostname) {
                    case 'rocksky.app': {
                        points = rate.requests ?? 1000;
                        duration = rate.perTime ?? 30;
                        const reqRate = maxRequestsPerSecond(points, duration);
                        if (reqRate > 33) {
                            this.logger.warn(`Cannot use a rate greater than 33req/s for rocksky.app. Reverting to 33req/s | Given: ${formatNumber(reqRate)}req/s`);
                            points = 1000;
                            duration = 30;
                        }
                    } break;
                    default:
                        points = rate.requests ?? 1;
                        duration = rate.perTime ?? 1;
                        break;
                }
                const api = new RockskyClientWrapped(undefined, rsConfig.token, {rate: {points, duration}});
                rsMap.set(u.url.hostname, api);
                apis.push(api);
                this.logger.verbose(`Created Rocksky API for ${u.url.hostname} with Rate Limit ${points}req/${duration}s`);
            } else {
                apis.push(rs);
            }
        }
        this.rsProxy = ProxyWithCircuitBreaker.create<RockskyClientWrapped>(apis,() => ({
            halfOpenAfter: 30000,
            breaker: new ConsecutiveBreaker(3),
            onFailure: ({reason, duration}) => {
                this.logger.warn(new SimpleError(`Error occurred after ${duration}ms, will try next host`, {cause: reason, shortStack: true}));
            },
        }), {
            comparer: async (a, b) => await b.rateLimiterQueue.getTokensRemaining() - await a.rateLimiterQueue.getTokensRemaining()
        })
        this.logger.debug(`Rate limit prioritized API calls using hosts: ${hosts.join(' | ')}`);
    }

    protected getIdentifier(): string {
        return 'RSAPI';
    }

}