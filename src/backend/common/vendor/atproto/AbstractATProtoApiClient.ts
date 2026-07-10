import { getRoot } from "../../../ioc.ts";
import type {AbstractApiOptions} from "../../infrastructure/Atomic.ts";
import AbstractApiClient from "../AbstractApiClient.ts";
import type { MSCache } from "../../Cache.ts";
import { UpstreamError } from "../../errors/UpstreamError.ts";
import { streamBodyProgress } from "../../../utils/NetworkUtils.ts";
import type {ATProtoUserIdentifierData, HandleData} from "../../infrastructure/config/client/atproto.ts";
import { checkPds, isDID, identifierToAtProtoHandle, getATProtoIdentifier } from "./atUtils.ts";
import type { Client} from '@atcute/client';
import { ClientResponseError, isXRPCErrorPayload, parseRateLimitHeaders } from '@atcute/client';
import { ComAtprotoSyncGetRepo } from '@atcute/atproto';
import type {AtprotoDid} from "@atcute/lexicons/syntax";
import { todayAwareFormat } from "../../../../core/TimeUtils.ts";
import dayjs from "dayjs";
import type {Millisecond} from "../../../../core/Atomic.ts";

export interface RateLimitInfo {
    limit: number
    reset: Millisecond
    remaining: number
}

export abstract class AbstractATProtoApiClient extends AbstractApiClient {

    declare config: ATProtoUserIdentifierData;

    declare client: Client;

    userData!: HandleData

    cache: MSCache;

    constructor(name: any, config: ATProtoUserIdentifierData & {handleData?: HandleData}, options: AbstractApiOptions) {
        super('atproto', name, config, options);
        this.cache = getRoot().items.cache();

        if(config.handleData !== undefined) {
            this.userData = config.handleData;
            this.config.did = config.handleData.did;
            this.config.identifier = config.handleData.handle;
        } else {
            const cleanIdentifier = this.config.identifier;
            if(isDID(cleanIdentifier)) {
                this.logger.debug(`Identifier ${cleanIdentifier} looks like a DID, skipping parsing as a handle.`);
                this.config.did = cleanIdentifier;
            } else {
                this.config.identifier = identifierToAtProtoHandle(this.config.identifier, {logger: this.logger, defaultDomain: 'bsky.social'});
            }
        }
    }

    abstract initClient(): Promise<void>;

    async checkPds(data: ATProtoUserIdentifierData): Promise<true> {
        return await checkPds(data, {logger: this.logger, cache: this.cache.cacheAuth});
    }

    async hydrateHandleData(): Promise<void> {
        if(this.userData === undefined) {
            this.userData = await getATProtoIdentifier(this.config, {logger: this.logger, cache: this.cache.cacheAuth});
        }
    }

    async getCAR(did: AtprotoDid) {
        const resp = await this.client.call(ComAtprotoSyncGetRepo, {
            params: {
                did
            },
            as: 'stream'
        });
        if(!resp.ok) {
            let text: string;
            if(isXRPCErrorPayload(resp.data)) {
                text = resp.data.error;
            }
            throw new UpstreamError(`Failed to fetch repo CAR file. Response was ${resp.status} with response ${text}`, {responseBody: text});
        }

        resp.headers
        return await streamBodyProgress(resp.data, {
            logger: this.logger,
            chunkDefaultSize: 1024 * 1024 * 5, // report progress every 5 MB
            fileHint: 'repo CAR'
        });
    }

    public async post<T extends ReturnType<Client['post']>>(func: (client: Client) => T): Promise<T> {
        await this.checkRateLimit();
        try {
            const res = await func(this.client);
            this.setRateLimitsFromResponse(res.headers);
            return res;
        } catch (e) {
            throw await this.handleError(e);
        }
    }
    public async get<T extends ReturnType<Client['get']>>(func: (client: Client) => T): Promise<T> {
        await this.checkRateLimit();
        try {
            const res = await func(this.client);
            this.setRateLimitsFromResponse(res.headers);
            return res;
        } catch (e) {
            throw await this.handleError(e);
        }
    }
    public async call<T extends ReturnType<Client['call']>>(func: (client: Client) => T): Promise<T> {
        await this.checkRateLimit();
        try {
            const res = await func(this.client);
            this.setRateLimitsFromResponse(res.headers);
            return res;
        } catch (e) {
            throw await this.handleError(e);
        }
    }

    protected getAuthCacheKey() {
        if(this.userData?.did) {
            return `atproto-${this.name}-${this.userData.did}`;
        }
        return `atproto-${this.name}`;
    }

    protected async setRateLimitsFromResponse(headers?: Headers) {
        if (headers === undefined || headers === null) {
            return;
        }
        try {
            const info = parseRateLimitHeaders(headers);
            const secUntilReset = dayjs(info.reset).diff(dayjs(), 's');
            if (info !== null) {
                await this.cache.cacheAuth.set<RateLimitInfo>(`${this.getAuthCacheKey()}-rateLimitInfo`, { limit: info.limit, remaining: info.remaining, reset: info.reset.valueOf() }, Math.min(secUntilReset, 3600));
            }
        } catch (e) {
            this.logger.warn(new Error('Failed to parse or set rate limit data', { cause: e }));
        }
    }

    protected async checkRateLimit() {
        const limitInfo = await this.cache.cacheAuth.get<RateLimitInfo>(`${this.getAuthCacheKey()}-rateLimitInfo`);
        if(limitInfo === undefined) {
            return;
        }
        if(limitInfo.remaining === 0) {
            throw new UpstreamError(`(Cached) Rate limit is exceeded and will be reset at ${todayAwareFormat(dayjs(limitInfo.reset))}`);
        }
    }

    protected async handleError(e: Error) {
        if (e instanceof ClientResponseError || ('headers' in e)) {
            await this.setRateLimitsFromResponse(e.headers as Headers);
        }
        if (e instanceof ClientResponseError && e.error === 'RateLimitExceeded') {
            const info = parseRateLimitHeaders(e.headers);
            if (info !== null) {
                return new UpstreamError(`Rate limit is exceeded and will be reset at ${todayAwareFormat(dayjs(info.reset))}`, { cause: e });
            }
        }
        if (e instanceof ClientResponseError) {
            return new UpstreamError('Error while communicating with appview/pds', { cause: e });
        }
        return e;
    }
}
