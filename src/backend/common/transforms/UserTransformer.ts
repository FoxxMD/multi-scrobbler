import { searchAndReplace } from "@foxxmd/regex-buddy-core";
import { PlayObject } from "../../../core/Atomic.js";
import { testWhenConditions } from "../../utils/PlayTransformUtils.js";
import { WebhookPayload } from "../infrastructure/config/health/webhooks.js";
import { ConditionalSearchAndReplaceRegExp, PlayTransformUserParts } from "../infrastructure/Transform.js";
import AbstractTransformer, { TransformerCommon } from "./AbstractTransformer.js"

export default class UserTransformer extends AbstractTransformer<ConditionalSearchAndReplaceRegExp[], undefined> {

    protected constructor(config: TransformerCommon) {
        super(config);
    }

    protected generateMapper(play: PlayObject) {
        return (x: ConditionalSearchAndReplaceRegExp): ConditionalSearchAndReplaceRegExp => ({ ...x, test: (x.when !== undefined ? () => testWhenConditions(x.when, play, { testMaybeRegex: this.regexCache.testMaybeRegex }) : undefined) });
    }

    protected async handleTitle(play: PlayObject, parts: ConditionalSearchAndReplaceRegExp[], _transformData: undefined): Promise<string | undefined> {
        if (play.data.track === undefined) {
            return undefined;
        }
        const mapper = this.generateMapper(play);
        return searchAndReplace(play.data.track, parts.map(mapper));
    }
    protected async handleArtists(play: PlayObject, parts: ConditionalSearchAndReplaceRegExp[], _transformData: undefined): Promise<string[] | undefined> {
        if(play.data.artists === undefined || play.data.artists.length === 0) {
            return play.data.artists;
        }
        const mapper = this.generateMapper(play);
        const transformedArtists = [];
        for(const artist of play.data.artists) {
            const a = searchAndReplace(artist, parts.map(mapper));
            if(a.trim() !== '') {
                transformedArtists.push(a);
            }
        }
        return transformedArtists;
    }
    protected async handleAlbumArtists(play: PlayObject, parts: ConditionalSearchAndReplaceRegExp[], _transformData: undefined): Promise<string[] | undefined> {
        if(play.data.albumArtists === undefined || play.data.albumArtists.length === 0) {
            return play.data.albumArtists;
        }
        const mapper = this.generateMapper(play);
        const transformedArtists = [];
        for(const artist of play.data.albumArtists) {
            const a = searchAndReplace(artist, parts.map(mapper));
            if(a.trim() !== '') {
                transformedArtists.push(a);
            }
        }
        return transformedArtists;
    }
    protected async handleAlbum(play: PlayObject, parts: ConditionalSearchAndReplaceRegExp[], _transformData: undefined): Promise<string | undefined> {
        if (play.data.track === undefined) {
            return undefined;
        }
        const mapper = this.generateMapper(play);
        return searchAndReplace(play.data.album, parts.map(mapper));
    }

    public notify(payload: WebhookPayload): Promise<void> {
        throw new Error("Method not implemented.");
    }
    protected getIdentifier(): string {
        return 'User Transformer';
    }

}