import { isPlayObject } from "../../../../core/Atomic.js";
import { getRoot } from "../../../ioc.js";
import { urlContainsKnownMediaDomain } from "../../../utils/RequestUtils.js";
import { MSCache } from "../../Cache.js";
import { isSuperAgentResponseError } from "../../errors/ErrorUtils.js";
import { AbstractApiOptions, SourceData } from "../../infrastructure/Atomic.js";
import { ActivityAssets, ARTWORK_PLACEHOLDER, DiscordStrongData, MS_ART } from "../../infrastructure/config/client/discord.js";
import AbstractApiClient from "../AbstractApiClient.js";
import { CoverArtApiClient } from "../musicbrainz/CoverArtApiClient.js";
import EventEmitter from "events";
import request from 'superagent';


export class DiscordAbstractClient extends AbstractApiClient {

    declare config: DiscordStrongData;

    emitter: EventEmitter;
    cache: MSCache;
    covertArtApi: CoverArtApiClient;
    artFail: boolean = false;
    artFailCount = 0;

    constructor(type: string, name: any, config: DiscordStrongData, options: AbstractApiOptions) {
        super(type, name, config, options);
        this.emitter = new EventEmitter();
        this.cache = getRoot().items.cache();
        this.covertArtApi = getRoot().items.coverArtApi;
    }

    getArtworkUrl = async (artUrl: string): Promise<string | undefined> => {

        const cachedUrl = await this.cache.cacheMetadata.get<string>(artUrl);
        if (cachedUrl !== undefined) {
            return cachedUrl;
        }

        if (this.config.applicationId === undefined || this.artFail) {
            return;
        }

        try {
            const imgResp = await request.post(`https://discord.com/api/v10/applications/${this.config.applicationId}/external-assets`)
                .set('Authorization', this.config.token)
                .type('json')
                .send({ "urls": [artUrl] });
            this.artFailCount = 0;
            const proxied = `mp:${imgResp.body[0].external_asset_path}`
            await this.cache.cacheMetadata.set(artUrl, proxied);
            return proxied;
        } catch (e) {
            this.artFailCount++;
            this.logger.warn(new Error('Failed to upload art url', { cause: e }));
            if (isSuperAgentResponseError(e)) {
                if (e.status === 401 || e.status === 403) {
                    this.artFail = true;
                }
            } else if (this.artFailCount > 3) {
                this.logger.verbose('More than 3 consecutive failures to upload art...turning off to stop spamming bad requests');
                this.artFail = true;
            }
            return;
        }
    }

    getArtAsset = async (data: SourceData, artUrl?: string): Promise<ActivityAssets | undefined> => {
        const {
            artwork = false
        } = this.config;
        const {
            artworkDefaultUrl = ARTWORK_PLACEHOLDER,
            applicationId
        } = this.config;

        const assets: ActivityAssets = {};

        if(applicationId !== undefined) {

            let art = artworkDefaultUrl;
            if(artUrl !== undefined) {
                if(urlContainsKnownMediaDomain(artUrl)) {
                    art = artUrl;
                } else if (artwork !== false) {
                    if (Array.isArray(artwork)) {
                        const allowed = artwork.some(x => artUrl.toLocaleLowerCase().includes(x.toLocaleLowerCase()));
                        if (allowed) {
                            art = artUrl;
                        }
                    } else {
                        const u = new URL(artUrl);
                        // only allow secure protocol as this is likely to be a real domain that is public accessible
                        // IP domain usually uses http only
                        if (u.protocol === 'https://') {
                            art = artUrl;
                        }
                    }
                }
            }

            if(art === artworkDefaultUrl) {
                const play = isPlayObject(data) ? data : data.play;
                if(play.data.meta?.brainz?.album !== undefined) {
                    const albumArt = await this.covertArtApi.getCoverThumb(play.data.meta?.brainz?.album, {size: 250});
                    if(albumArt !== undefined) {
                        art = albumArt;
                    }
                }
            }

            // https://docs.discord.com/developers/events/gateway-events#activity-object-activity-assets
            // https://docs.discord.com/developers/events/gateway-events#activity-object-activity-asset-image
            const usedUrl = await this.getArtworkUrl(art);
            if(usedUrl !== undefined) {
                assets.largeImage = usedUrl;
            }
            if(art !== MS_ART) {
                const smallArt = await this.getArtworkUrl(MS_ART);
                if(smallArt !== undefined) {
                        assets.smallImage = smallArt;
                        assets.smallText = 'Via Multi-Scrobbler'
                        assets.smallUrl = 'https://multi-scrobbler.app'
                } 
            }
        }

        if(Object.keys(assets).length === 0) {
            return;
        }
        return assets;
    }

}