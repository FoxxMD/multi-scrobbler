import AbstractApiClient from "../AbstractApiClient.ts";
import { ROCKSKY_URL, type RockskyApiClientConfig } from "./interfaces.ts";
import type { Cacheable } from "cacheable";
import type { AbstractApiOptions } from "../../infrastructure/Atomic.ts";
import { getRootCommon } from "../../../iocCommon.ts";
import type { CircuitBreakerProxy } from "@foxxmd/load-balancer-proxy";
import { ProxyWithCircuitBreaker } from "@foxxmd/load-balancer-proxy";
import { maxRequestsPerSecond, normalizeWebAddress } from "../../../utils/NetworkUtils.ts";
import { formatNumber } from "../../../../core/DataUtils.ts";
import { ConsecutiveBreaker } from "cockatiel";
import { SimpleError } from "../../errors/MSErrors.ts";
import { RockskyClientWrapped } from "./RockskyClientWrapped.ts";

export class RockskyClientPool extends AbstractApiClient {
    declare config: RockskyApiClientConfig;
    public rsProxy: CircuitBreakerProxy<RockskyClientWrapped>
    cache: Cacheable;

    constructor(name: any, config: RockskyApiClientConfig, options: AbstractApiOptions & { cache?: Cacheable }) {
        const {apis = [{enable: true}]} = config;
        super('Rocksky API', name, {...config, apis}, options);
        this.cache = options.cache ?? getRootCommon().cache().cacheApi;

        const rsMap = getRootCommon().rsMap();

        const usedApis: RockskyClientWrapped[] = [];
        const hosts: string[] = [];
        for (const rsConfig of apis) {
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
                    case 'api.rocksky.app': {
                        points = rate.requests ?? 1000;
                        duration = rate.perTime ?? 30;
                        const reqRate = maxRequestsPerSecond(points, duration);
                        if (reqRate > 33.4) {
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
                usedApis.push(api);
                this.logger.verbose(`Created Rocksky API for ${u.url.hostname} with Rate Limit ${points}req/${duration}s`);
            } else {
                usedApis.push(rs);
            }
        }
        this.rsProxy = ProxyWithCircuitBreaker.create<RockskyClientWrapped>(usedApis,() => ({
            halfOpenAfter: 30000,
            breaker: new ConsecutiveBreaker(3),
            onFailure: ({reason, duration}: {reason: any, duration: number}) => {
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

