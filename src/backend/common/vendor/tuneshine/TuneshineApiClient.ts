import { normalizeWebAddress } from "../../../utils/NetworkUtils.ts";
import { SimpleError } from "../../errors/MSErrors.ts";
import type { AbstractApiOptions } from "../../infrastructure/Atomic.ts";
import type { TuneshineClientConfig } from "../../infrastructure/config/client/tuneshine.ts";
import AbstractApiClient from "../AbstractApiClient.ts";
import type { paths, components } from './tuneshine.d.ts';
import createClient from "openapi-fetch";
import type { Client } from "openapi-fetch";
import sharp, { type SharpInput } from 'sharp';
import ky from 'ky';
import type { PlayObject, URLData } from "../../../../core/Atomic.ts";
import { getRoot } from "../../../ioc.ts";
import type { Cacheable } from "cacheable";
import { nowPlayingExpirationDuration } from "../../../scrobblers/AbstractScrobbleClient.ts";
import { UpstreamError } from "../../errors/UpstreamError.ts";

export class TuneshineApiClient extends AbstractApiClient {

    declare config: TuneshineClientConfig;
    cache: Cacheable;

    api!: Client<paths>;

    host!: URLData;

    //private lastArtUrl?: string;

    constructor(name: string, config: Pick<TuneshineClientConfig, 'data' | 'options'>, options: AbstractApiOptions & { cache?: Cacheable }) {
        super('Tuneshine', name, config, options);
        this.cache = options.cache ?? getRoot().items.cache().cacheApi;
    }

    public async buildData() {
        const {
            data: {
                host
            } = {}
        } = this.config;
        if (host === undefined) {
            throw new SimpleError('host must be defined');
        }
        const u = normalizeWebAddress(host);
        this.host = u;
        this.logger.verbose(`Config Host: '${host ?? '(None Given)'}' => Normalized: '${u.url}'`);
        this.api = createClient<paths>({ baseUrl: u.url.toString() })
    }

    public async checkConnection() {
        try {
            await this.api.GET('/health');
            //await isPortReachableConnect(this.host.port, { host: this.host.url.hostname });
        } catch (e) {
            new UpstreamError('Unable to reach Tuneshine /health endpoint', { cause: e })
        }
    }

    async clearNowPlaying() {
        try {
            const res = await this.api.DELETE("/image");
        } catch (e) {
            throw new UpstreamError(`Clearing Now Playing failed with error`, {cause: e});
        }
    }

    async sendNowPlaying(play: PlayObject) {
        let artUrl: string | undefined = undefined;
        if (play.meta?.art?.track !== undefined) {
            artUrl = play.meta?.art?.track;
        } else if (play.meta?.art?.album !== undefined) {
            artUrl = play.meta?.art?.album;
        } else if (play.meta?.art?.artist !== undefined) {
            artUrl = play.meta?.art?.artist;
        }
        if (artUrl === undefined) {
            throw new SimpleError('No art found on Play');
        }
        const metadata = playToPostImageMetadata(play);

        // TODO optimize to only update metadata if we can determine current artwork is same as last artwork
        // for now we will just always send new art
        //
        // if(this.lastArtUrl !== undefined && artUrl === this.lastArtUrl) {
        //     // there's a chance there is local artwork that is the same as the previous track
        //     // try to see if we should just update metadata
        // }

        //const formData = new FormData();
        let imageContents: string;
        try {
            imageContents = (await this.convertToWebp({ url: artUrl })).toString();
            //formData.append('image', (await this.convertToWebp({ url: artUrl })).toString());
        } catch (e) {
            throw new Error('Failed to process art image before sending Now Playing data', {cause: e});
        }
        
        //formData.append('metadata', JSON.stringify(metadata));

        try {
            const res = await this.api.POST("/image", {
                bodySerializer(body) {
                    const fd = new FormData();
                    for (const name in body) {
                        // @ts-expect-error not sure how to fix this but its fine
                        fd.append(name, body[name] as string);
                    }
                    return fd;
                },
                body: {
                    image: imageContents,
                    metadata: JSON.stringify(metadata)
                },
            });
            if(res.error !== undefined) {
                throw new UpstreamError(`Sending Now Playing data failed with error (${res.response.status}) ${res.error?.message}`)
            }
        } catch (e) {
            throw new UpstreamError('Failed to POST to /image with Now Playing data', { cause: e });
        }

    }

    public async convertToWebp(opts: { url?: string, data?: SharpInput }) {
        let input: SharpInput;
        if (opts.data !== undefined) {
            input = opts.data;
        } else if (opts.url !== undefined) {
            try {
                input = await ky.get(opts.url).arrayBuffer();
            } catch (e) {
                throw new UpstreamError(`Failed to get resource from art URL ${opts.url}`, { cause: e });
            }
        } else {
            throw new SimpleError('Must pass either url or data');
        }
        try {
            return sharp(input)
                .resize(64, 64, { withoutEnlargement: true })
                .webp({ nearLossless: true })
                .toBuffer()
        } catch (e) {
            throw new SimpleError(`Failed to convert ${opts.url !== undefined ? `resource from URL ${opts.url}` : 'image data'} to webp`, { cause: e });
        }
    }
}

export const playToPostImageMetadata = (play: PlayObject): components['schemas']['ImageUrlRequest'] => ({
    timeoutMs: nowPlayingExpirationDuration({ play, position: play.meta.trackProgressPosition }).asMilliseconds(),
    trackName: play.data.track,
    artistName: play.data.artists === undefined ? undefined : play.data.artists.map(x => x.name).join(' / '),
    albumName: play.data.album,
    serviceName: play.meta.musicService ?? play.meta.source,
    itemId: play.meta.trackId ?? play.uid,
    imageUrl: play.meta?.art?.track ?? play.meta?.art?.album ?? play.meta?.art?.artist,
    contentType: 'track'
});