import { normalizeWebAddress } from "../../../utils/NetworkUtils.ts";
import { SimpleError } from "../../errors/MSErrors.ts";
import type { AbstractApiOptions } from "../../infrastructure/Atomic.ts";
import type { TuneshineClientConfig } from "../../infrastructure/config/client/tuneshine.ts";
import AbstractApiClient from "../AbstractApiClient.ts";
import type { paths, operations, components } from './tuneshine.d.ts';
import createClient from "openapi-fetch";
import type {Client} from "openapi-fetch";
import sharp, { type SharpInput } from 'sharp';
import ky from 'ky';
import type { PlayObject } from "../../../../core/Atomic.ts";
import { getRoot } from "../../../ioc.ts";
import type { Cacheable } from "cacheable";
import { nowPlayingExpirationDuration } from "../../../scrobblers/AbstractScrobbleClient.ts";

export class TuneshineApiClient extends AbstractApiClient {

    declare config: TuneshineClientConfig;
    cache: Cacheable;

    api!: Client<paths>;

    constructor(name: string, config: TuneshineClientConfig, options: AbstractApiOptions & {cache?: Cacheable}) {
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
        this.logger.verbose(`Config Host: '${host ?? '(None Given)'}' => Normalized: '${u.url}'`);
        this.api = createClient<paths>({baseUrl: u.url.toString()})
    }

    async clearNowPlaying() {
        const {data, error} = await this.api.DELETE("/image");
    }

    async sendNowPlaying(play: PlayObject) {
        let artUrl: string | undefined = undefined;
        if(play.meta?.art?.track !== undefined) {
            artUrl = play.meta?.art?.track;
        } else if(play.meta?.art?.album !== undefined) {
            artUrl = play.meta?.art?.album;
        } else if(play.meta?.art?.artist !== undefined) {
            artUrl = play.meta?.art?.artist;
        }
        if(artUrl === undefined) {
            throw new SimpleError('No art found on Play');
        }
        //const postImage = this.api.path('/image').method('post').create();
        const metadata = playToPostImageMetadata(play);

        const {data, error} = await this.api.POST("/image", {
            body: {
                image: (await this.convertToWebp({url: artUrl})).toString(),
                metadata: JSON.stringify(metadata)
            }
        });
    }

    public async convertToWebp(opts: { url?: string, data?: SharpInput }) {
        let input: SharpInput;
        if (opts.data !== undefined) {
            input = opts.data;
        } else if (opts.url !== undefined) {
            input = await ky.get(opts.url).arrayBuffer();
        } else {
            throw new SimpleError('Must pass either url or data');
        }
        return sharp(input)
            .resize(64, 64, { withoutEnlargement: true })
            .webp({ nearLossless: true })
            .toBuffer()
    }
}

const playToPostImageMetadata = (play: PlayObject): components['schemas']['ImageUrlRequest'] => ({
        timeoutMs: nowPlayingExpirationDuration({play, position: play.meta.trackProgressPosition }).asMilliseconds(),
        trackName: play.data.track,
        artistName: play.data.artists === undefined ? undefined : play.data.artists.map(x => x.name).join(' / '),
        albumName: play.data.album,
        serviceName: play.meta.musicService ?? play.meta.source,
        itemId: play.meta.trackId ?? play.uid
});