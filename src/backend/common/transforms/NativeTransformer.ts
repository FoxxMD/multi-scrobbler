import { PlayObject } from "../../../core/Atomic.js";
import { isUserStage, isWhenCondition, testWhenConditions } from "../../utils/PlayTransformUtils.js";
import { WebhookPayload } from "../infrastructure/config/health/webhooks.js";
import { ExternalMetadataTerm, PlayTransformNativeStage, StageConfig } from "../infrastructure/Transform.js";
import AtomicPartsTransformer from "./AtomicPartsTransformer.js";
import { parseArtistCredits, parseTrackCredits, uniqueNormalizedStrArr } from "../../utils/StringUtils.js";

export default class NativeTransformer extends AtomicPartsTransformer<ExternalMetadataTerm, PlayObject | undefined> {

    protected doParseConfig(data: StageConfig) {
        if (data.type !== 'native') {
            throw new Error(`NativeTransformer is only usable with 'native' type stages`);
        }

        const stage: PlayTransformNativeStage<ExternalMetadataTerm> = {
            ...data,
            type: 'native'
        }

        for (const k of ['artists', 'title', 'album']) {
            if (!(k in data)) {
                continue;
            }
            if (Array.isArray(data[k])) {
                throw new Error(`${k} must be a boolean or when object`);
            }
            if (typeof data[k] === 'boolean') {
                continue;
            }
            if (typeof data[k] === 'object' && !isWhenCondition(data[k])) {
                throw new Error(`${k} is not a valid when object`);
            }
        }
        return stage;
    }

    public async getTransformerData(play: PlayObject): Promise<PlayObject> {
        let artists = [];
        if (play.data.artists.length === 1) {
            const artistCredits = parseArtistCredits(play.data.artists[0]);
            if (artistCredits !== undefined) {
                if (artistCredits.primary !== undefined) {
                    artists.push(artistCredits.primary);
                }
                if (artistCredits.secondary !== undefined) {
                    artists = artists.concat(artistCredits.secondary);
                }
            }
        }
        const trackArtists = parseTrackCredits(play.data.track);
        if (trackArtists !== undefined && trackArtists.secondary !== undefined) {
            artists = artists.concat(trackArtists.secondary);
        }
        artists = uniqueNormalizedStrArr([...artists]);

        return {
            ...play,
            data: {
                ...play.data,
                artists
            }
        };
    }

    protected async handleTitle(play: PlayObject, parts: ExternalMetadataTerm, _transformData: undefined): Promise<string | undefined> {
        return play.data.track;
    }
    protected async handleArtists(play: PlayObject, parts: ExternalMetadataTerm, transformData: PlayObject): Promise<string[] | undefined> {
        if (parts === false || parts === undefined) {
            return play.data.artists;
        }
        if (typeof parts === 'object') {
            if (parts.when !== undefined) {
                if (!testWhenConditions(parts.when, play, { testMaybeRegex: this.regexCache.testMaybeRegex })) {
                    this.logger.debug('When condition for artists not met, returning original artists');
                    return play.data.artists;
                }
            }
        }

        return transformData.data.artists;
    }
    protected async handleAlbumArtists(play: PlayObject, parts: ExternalMetadataTerm, _transformData: undefined): Promise<string[] | undefined> {
        return play.data.albumArtists;
    }
    protected async handleAlbum(play: PlayObject, parts: ExternalMetadataTerm, _transformData: undefined): Promise<string | undefined> {
        return play.data.album;
    }

    public notify(payload: WebhookPayload): Promise<void> {
        throw new Error("Method not implemented.");
    }
    protected getIdentifier(): string {
        return 'Native Transformer';
    }

}