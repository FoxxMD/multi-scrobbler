import { searchAndReplace } from "@foxxmd/regex-buddy-core";
import { PlayObject } from "../../../core/Atomic.js";
import { configValToSearchReplace, isSearchAndReplaceTerm, isUserStage, testWhenConditions } from "../../utils/PlayTransformUtils.js";
import { WebhookPayload } from "../infrastructure/config/health/webhooks.js";
import { ConditionalSearchAndReplaceRegExp, PlayTransformUserStage, StageConfig } from "../infrastructure/Transform.js";
import AtomicPartsTransformer from "./AtomicPartsTransformer.js";

export default class UserTransformer extends AtomicPartsTransformer<ConditionalSearchAndReplaceRegExp[], undefined> {

    // protected constructor(config: TransformerCommon) {
    //     super(name, config);
    // }

    protected doParseConfig(data: StageConfig) {
        if (!isUserStage(data)) {
            throw new Error(`UserTransformer is only usable with 'user' type stages`);
        }

        const stage: PlayTransformUserStage<ConditionalSearchAndReplaceRegExp[]> = {
            ...data,
            type: 'user'
        }

        for (const k of ['artists', 'title', 'album']) {
            if (!(k in data)) {
                continue;
            }
            if (!Array.isArray(data[k])) {
                throw new Error(`${k} must be an array`);
            }
            try {
                isSearchAndReplaceTerm(data[k]);
                stage[k] = data[k].map(configValToSearchReplace);
            } catch (e) {
                throw new Error(`Property '${k}' was not a valid type`, { cause: e });
            }
        }
        return stage;
    }

    protected generateMapper(play: PlayObject) {
        return (x: ConditionalSearchAndReplaceRegExp): ConditionalSearchAndReplaceRegExp => ({ ...x, test: (x.when !== undefined ? () => testWhenConditions(x.when, play, { testMaybeRegex: this.regex.testMaybeRegex }) : undefined) });
    }

    protected async handleTitle(play: PlayObject, parts: ConditionalSearchAndReplaceRegExp[], _transformData: undefined): Promise<string | undefined> {
        if (play.data.track === undefined) {
            return undefined;
        }
        const mapper = this.generateMapper(play);
        const result = searchAndReplace(play.data.track, parts.map(mapper));
        if(result.trim() === '') {
            return undefined;
        }
        return result.trim();
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
        if (play.data.album === undefined) {
            return undefined;
        }
        const mapper = this.generateMapper(play);
        const result = searchAndReplace(play.data.album, parts.map(mapper));
        if(result.trim() === '') {
            return undefined;
        }
        return result.trim();
    }

    public notify(payload: WebhookPayload): Promise<void> {
        return;
    }

}