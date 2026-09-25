import AbstractApiClient from "../AbstractApiClient.ts";
import type { Cacheable } from "cacheable";
import type { AbstractApiOptions } from "../../infrastructure/Atomic.ts";
import { getRoot } from "../../../ioc.ts";
import { type CircuitBreakerProxy, ProxyWithCircuitBreaker } from "@foxxmd/load-balancer-proxy";
import { normalizeWebAddress } from "../../../utils/NetworkUtils.ts";
import { ConsecutiveBreaker } from "cockatiel";
import { SimpleError } from "../../errors/MSErrors.ts";
import { CoverArtApiClient } from "./CoverArtApiClient.ts";
import { DEFAULT_CAA_URL, type CovertArtApiClientConfig } from "./CoverArtApiTypes.ts";

export type CovertArtSingletonMap = Map<string, CoverArtApiClient>;

export class CoverArtClientPool extends AbstractApiClient {
    declare config: CovertArtApiClientConfig;
    public proxy: CircuitBreakerProxy<CoverArtApiClient>
    cache: Cacheable;

    constructor(name: any, config: CovertArtApiClientConfig, options: AbstractApiOptions & { cache?: Cacheable }) {
        const {apis = [{enable: true}]} = config;
        super('CAA Pool', name, {...config, apis}, options);
        this.cache = options.cache ?? getRoot().items.cache().cacheApi;

        const caMap = getRoot().items.caMap();

        const usedApis: CoverArtApiClient[] = [];
        const hosts: string[] = [];
        for (const apiConfig of apis) {
            if ((apiConfig.enable ?? true) === false) {
                this.logger.verbose(`Not using config for ${apiConfig.url ?? DEFAULT_CAA_URL} because it is disabled`);
                continue;
            }
            const {
                rate = {},
                url,
                ...rest
            } = apiConfig;
            const u = normalizeWebAddress((url ?? DEFAULT_CAA_URL).toLocaleLowerCase());
            hosts.push(u.url.hostname);
            const rs = caMap.get(u.url.hostname);
            let points: number,
                duration: number;
            if (rs === undefined) {
                switch (u.url.hostname) {
                    default:
                        points = rate.requests ?? 100;
                        duration = rate.perTime ?? 1;
                        break;
                }
                const api = new CoverArtApiClient(undefined, {rate: {requests: points, perTime: duration}, ...rest}, {logger: this.logger});
                caMap.set(u.url.hostname, api);
                usedApis.push(api);
                this.logger.verbose(`Created CoverArtArchive API for ${u.url.hostname} with Rate Limit ${points}req/${duration}s`);
            } else {
                usedApis.push(rs);
            }
        }
        this.proxy = ProxyWithCircuitBreaker.create<CoverArtApiClient>(usedApis,() => ({
            halfOpenAfter: 30000,
            breaker: new ConsecutiveBreaker(3),
            onFailure: ({reason, duration}: any) => {
                this.logger.warn(new SimpleError(`Error occurred after ${duration}ms, will try next host`, {cause: reason, shortStack: true}));
            },
        }), {
            comparer: async (a, b) => await b.rateLimiterQueue.getTokensRemaining() - await a.rateLimiterQueue.getTokensRemaining()
        })
        this.logger.debug(`Rate limit prioritized API calls using hosts: ${hosts.join(' | ')}`);
    }

    protected getIdentifier(): string {
        return 'CAAAPI';
    }

}