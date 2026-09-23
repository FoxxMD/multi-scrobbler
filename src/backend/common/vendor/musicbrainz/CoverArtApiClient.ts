import { Cacheable } from "cacheable";
import type {AbstractApiOptions} from "../../infrastructure/Atomic.ts";
import AbstractApiClient from "../AbstractApiClient.ts";
import request from 'superagent';
import { isSuperAgentResponseError } from "../../errors/ErrorUtils.ts";
import { UpstreamError } from "../../errors/UpstreamError.ts";
import { initMemoryCache } from "../../Cache.ts";
import { joinedUrl, normalizeWebAddress } from "../../../utils/NetworkUtils.ts";
import type {RetryContext} from "p-retry";
import { NO_RETRY_HTTP_STATUS, tryApiCall } from "../../../utils/RequestUtils.ts";
import { RateLimiterMemory, RateLimiterQueue } from "rate-limiter-flexible";
import { type CoverArtReleaseResponse, DEFAULT_CAA_URL, THUMB_SIZES, type ThumbOptions, type CoverArtApiConfig } from "./CoverArtApiTypes.ts";

export class CoverArtApiClient extends AbstractApiClient {

    declare config: CoverArtApiConfig;
    cache: Cacheable;
    baseUrl: URL;
    public rateLimiterQueue: RateLimiterQueue;

    constructor(name: any, config: CoverArtApiConfig, options: AbstractApiOptions & { cache?: Cacheable }) {
        super('CoverArtArchive', '', config, options);
        const {
            url = DEFAULT_CAA_URL,// new URL('https://coverartarchive.org'),
            rate: {
                requests = 100,
                perTime = 1
            } = {}
        } = config;
        const u = normalizeWebAddress(url);
        this.rateLimiterQueue = this.rateLimiterQueue = new RateLimiterQueue(new RateLimiterMemory({ 
            points: requests, 
            duration: perTime 
        }), { maxQueueSize: 20 });
        this.baseUrl = u.url;
        this.cache = options.cache ?? new Cacheable({ primary: initMemoryCache({ lruSize: 50 }) });
    }

    protected getIdentifier() {
        return 'API - CoverArtArchive';
    }

    getCoverThumb = async (mbid: string, mbidType: 'release' | 'release-group', opt: ThumbOptions = {}): Promise<string | undefined> => {
        const {
            type = 'front',
            size
        } = opt;

        if (size !== undefined && !THUMB_SIZES.includes(size)) {
            throw new Error(`Thumb size given (${size}) is not valid. Must be one of: ${THUMB_SIZES.join(' | ')}`);
        }
        const thumbParams = `${type}${size !== undefined ? `-${size}` : ''}`;
        const cacheKey = `albumart-${mbidType}-${mbid}-${thumbParams}`;
        const cachedArt = await this.cache.get<string | false>(cacheKey);
        if (cachedArt !== undefined) {
            if(cachedArt === false) {
                return undefined;
            }
            return cachedArt;
        } else {
            let result = undefined,
            err: Error;

            const url = joinedUrl(this.baseUrl, `/${mbidType}/${mbid}/${thumbParams}`);

            try {
                const resp = await this.coverThumbRequest(url.toString());
                if(resp === undefined) {
                    result = false;
                } else {
                    result = resp;
                }
                err = undefined;
            } catch (e) {
                err = e;
            }

            if(result === false) {
                this.logger.debug(`No front album art found for ${mbidType} ${mbid}`);
                await this.cache.set(cacheKey, false, '1hr');
                return undefined;
            }
            if(err !== undefined) {
                this.logger.warn(err);
            } else {
                await this.cache.set(cacheKey, result, '1hr');
            }
            return result;
        }
    }

    protected coverThumbRequest = async (url: string): Promise<string | undefined> => {
        try {
            await this.rateLimiterQueue.removeTokens(1);
            // TODO make tryApiCall accept async shouldRetry
            // https://musicbrainz.org/doc/Cover_Art_Archive/API#/release/{mbid}/({id}|front|back)-(250|500|1200)
            const resp = await tryApiCall(() => request
                .get(url)
                // only follow first redirect so we get the url without actually downloading the image
                .redirects(1), {
                    ...this.config,
                    logFailure: logUnexpectedStatus,
                    noRetryStatus: [...NO_RETRY_HTTP_STATUS, 404, 302, 307]
                });
                throw new Error('Should not be getting this far');
        } catch (e) {
            if (isSuperAgentResponseError(e)) {
                if (e.status === 302) {
                    return e.response.header['location'];
                } else if ([404].includes(e.status)) {
                    return undefined;
                } else {
                    throw new UpstreamError(`Unexpected response when trying to get album art`, { cause: e });
                }
            } else {
                throw new Error(`Error occurred when trying to get album art`, { cause: e });
            }
        }
    }

    public getCoverThumbFromUrl = async (url: string): Promise<string | undefined> => {
        const cachedLocation = await this.cache.get<string>(url);
        if(cachedLocation !== undefined) {
            return cachedLocation;
        }
        const location = await this.coverThumbRequest(url);
        await this.cache.set(url, false, '1hr');
        return location;
    }

    getCovers = async (mbid: string, mbidType: 'release' | 'release-group'): Promise<CoverArtReleaseResponse | undefined> => {
        const cacheKey = `caa-covers-${mbidType}-${mbid}`;
        const cachedArt = await this.cache.get<CoverArtReleaseResponse>(cacheKey);
        if (cachedArt !== undefined) {
            return cachedArt;
        } else {
            try {
                await this.rateLimiterQueue.removeTokens(1);
                // https://musicbrainz.org/doc/Cover_Art_Archive/API#/release/{mbid}/
                const resp = await request
                    .get(joinedUrl(this.baseUrl, `/${mbidType}/${mbid}`))
                    .redirects(3);
                await this.cache.set(cacheKey, resp.body, '1hr');
                return resp.body as CoverArtReleaseResponse;
            } catch (e) {
                if (isSuperAgentResponseError(e)) {
                    if ([404].includes(e.status)) {
                        // no image
                    } else {
                        this.logger.warn(new UpstreamError(`Unexpected response when trying to get album art`, { cause: e }));
                    }
                } else {
                    this.logger.warn(new Error(`Error occurred when trying to get album art`, { cause: e }));
                }
            }
        }
    }
}

const logUnexpectedStatus = (context: RetryContext): boolean => {
    return !isSuperAgentResponseError(context.error) || ![404,302,307].includes(context.error.status);
}