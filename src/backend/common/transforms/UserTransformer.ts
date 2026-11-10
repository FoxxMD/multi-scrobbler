import { type SearchAndReplaceRegExp, searchAndReplace } from "@foxxmd/regex-buddy-core";
import type {Credit, PlayObject} from "../../../core/Atomic.ts";
import { testWhenConditions } from "../../utils/PlayTransformUtils.ts";
import type {WebhookPayload} from "../infrastructure/config/health/webhooks.ts";
import {buildRulesSchema, buildStageSchema, type SearchReplaceTermStrict, searchReplaceTermSchema} from "../../../core/Transform.ts";
import AtomicPartsTransformer from "./AtomicPartsTransformer.ts";
import * as z from "zod";

const userRulesSchema = buildRulesSchema(z.array(searchReplaceTermSchema));

export const userStageSchema = buildStageSchema('user', userRulesSchema, z.object({})).meta({title: 'User Stage'});

export type UserStage = z.output<typeof userStageSchema>;

/** Search and replace term with its `when` turned into a test function for the play being transformed */
type SearchReplaceTermRuntime = SearchReplaceTermStrict & { test?: (obj: SearchAndReplaceRegExp) => boolean };

export default class UserTransformer extends AtomicPartsTransformer<SearchReplaceTermStrict[], undefined, UserStage> {

    protected readonly stageSchema = userStageSchema;

    /** Stage terms are applied first, then terms from transformer `defaults` */
    protected doParseConfig(data: UserStage): UserStage {
        const defaults = userRulesSchema.parse(this.config.defaults ?? {});
        const {
            title = [],
            artists = [],
            album = [],
            albumArtists = [],
        } = data;
        return {
            ...data,
            title: [...title, ...(defaults.title ?? [])],
            artists: [...artists, ...(defaults.artists ?? [])],
            album: [...album, ...(defaults.album ?? [])],
            albumArtists: [...albumArtists, ...(defaults.albumArtists ?? [])],
        };
    }

    protected generateMapper(play: PlayObject) {
        return (x: SearchReplaceTermStrict): SearchReplaceTermRuntime => {
            const {when} = x;
            return { ...x, test: (when !== undefined ? () => testWhenConditions(when, play, { testMaybeRegex: this.regex.testMaybeRegex }) : undefined) };
        };
    }

    protected async handleTitle(play: PlayObject, parts: SearchReplaceTermStrict[], _transformData: undefined): Promise<Credit | undefined> {
        if (play.data.track === undefined) {
            return undefined;
        }
        const mapper = this.generateMapper(play);
        const result = searchAndReplace(play.data.track.name, parts.map(mapper));
        if(result.trim() === '') {
            return undefined;
        }
        return {...play.data.track, name: result.trim()};
    }
    protected async handleArtists(play: PlayObject, parts: SearchReplaceTermStrict[], _transformData: undefined): Promise<Credit[] | undefined> {
        if(play.data.artists === undefined || play.data.artists.length === 0) {
            return play.data.artists;
        }
        const mapper = this.generateMapper(play);
        const transformedArtists = [];
        for(const artist of play.data.artists) {
            const a = searchAndReplace(artist.name, parts.map(mapper));
            if(a.trim() !== '') {
                transformedArtists.push({...artist, name: a});
            }
        }
        return transformedArtists;
    }
    protected async handleAlbumArtists(play: PlayObject, parts: SearchReplaceTermStrict[], _transformData: undefined): Promise<Credit[] | undefined> {
        if(play.data.albumArtists === undefined || play.data.albumArtists.length === 0) {
            return play.data.albumArtists;
        }
        const mapper = this.generateMapper(play);
        const transformedArtists = [];
        for(const artist of play.data.albumArtists) {
            const a = searchAndReplace(artist.name, parts.map(mapper));
            if(a.trim() !== '') {
                transformedArtists.push({...artist, name: a});
            }
        }
        return transformedArtists;
    }
    protected async handleAlbum(play: PlayObject, parts: SearchReplaceTermStrict[], _transformData: undefined): Promise<Credit | undefined> {
        if (play.data.album === undefined) {
            return undefined;
        }
        const mapper = this.generateMapper(play);
        const result = searchAndReplace(play.data.album.name, parts.map(mapper));
        if(result.trim() === '') {
            return undefined;
        }
        return {...play.data.album, name: result.trim()};
    }

    public async notify(payload: WebhookPayload): Promise<void> {
    }

}