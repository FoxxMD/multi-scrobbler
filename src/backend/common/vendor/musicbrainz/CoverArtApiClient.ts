import { Cacheable } from "cacheable";
import { AbstractApiOptions } from "../../infrastructure/Atomic.js";
import AbstractApiClient from "../AbstractApiClient.js";
import request, { ResponseError } from 'superagent';
import { isSuperAgentResponseError } from "../../errors/ErrorUtils.js";
import { UpstreamError } from "../../errors/UpstreamError.js";
import { initMemoryCache } from "../../Cache.js";
import { joinedUrl } from "../../../utils/NetworkUtils.js";

export type ThumbSize = 250 | 500 | 1200;
const THUMB_SIZES = [250, 500, 1200];

export interface ThumbOptions {
    type?: 'front' | 'back'
    size?: ThumbSize
}

export interface CoverArtReleaseImage {
    types: ('Front' | 'Booklet' | 'Back')[]
    front: boolean
    back: boolean
    image: string
    comment: string
    approve: boolean
    id: string
    thumbnails: {
        250: string
        500: string
        1200: string
        small: string
        large: string
    }
}

export interface CoverArtReleaseResponse {
    /** URL to musicbrainz release */
    release: string
    images: CoverArtReleaseImage[]
}

export interface CoverArtApiConfig {
    url?: URL;
}

export class CoverArtApiClient extends AbstractApiClient {

    declare config: CoverArtApiConfig;
    cache: Cacheable;
    baseUrl: URL;

    constructor(name: any, config: CoverArtApiConfig, options: AbstractApiOptions & { cache?: Cacheable }) {
        super('CoverArtArchive', '', config, options);
        const {
            url = new URL('https://coverartarchive.org'),
        } = config;
        this.baseUrl = url;
        this.cache = options.cache ?? new Cacheable({ primary: initMemoryCache({ lruSize: 50 }) });
    }

    protected getIdentifier() {
        return 'API - CoverArtArchive';
    }

    getCoverThumb = async (mbid: string, opt: ThumbOptions = {}): Promise<string | undefined> => {
        const {
            type = 'front',
            size
        } = opt;

        if (size !== undefined && !THUMB_SIZES.includes(size)) {
            throw new Error(`Thumb size given (${size}) is not valid. Must be one of: ${THUMB_SIZES.join(' | ')}`);
        }
        const thumbParams = `${type}${size !== undefined ? `-${size}` : ''}`;
        const cacheKey = `albumart-${mbid}-${thumbParams}`;
        const cachedArt = await this.cache.get<string>(cacheKey);
        if (cachedArt !== undefined) {
            return cachedArt;
        } else {
            try {
                // https://musicbrainz.org/doc/Cover_Art_Archive/API#/release/{mbid}/({id}|front|back)-(250|500|1200)
                const resp = await request
                    .get(joinedUrl(this.baseUrl, `/release/${mbid}/${thumbParams}`))
                    // only follow first redirect so we get the url without actually downloading the image
                    .redirects(1);
            } catch (e) {
                if (isSuperAgentResponseError(e)) {
                    if (e.status === 302) {
                        await this.cache.set(cacheKey, e.response.header['location'], '1hr');
                        return e.response.header['location'];
                    } else if ([404].includes(e.status)) {
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

    getCovers = async (mbid: string): Promise<CoverArtReleaseResponse | undefined> => {
        const cacheKey = `albumart-${mbid}`;
        const cachedArt = await this.cache.get<CoverArtReleaseResponse>(cacheKey);
        if (cachedArt !== undefined) {
            return cachedArt;
        } else {
            try {
                // https://musicbrainz.org/doc/Cover_Art_Archive/API#/release/{mbid}/
                const resp = await request
                    .get(joinedUrl(this.baseUrl, `/release/${mbid}`))
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