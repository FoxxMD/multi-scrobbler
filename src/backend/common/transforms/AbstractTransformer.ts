import { ObjectPlayData, PlayObject, TrackMeta } from "../../../core/Atomic.js";
import { getRoot } from "../../ioc.js";
import { testWhenConditions } from "../../utils/PlayTransformUtils.js";
import AbstractInitializable from "../AbstractInitializable.js";
import { ConditionalSearchAndReplaceRegExp, PlayTransformMetaParts, PlayTransformParts, PlayTransformUserParts } from "../infrastructure/Transform.js";
import { cacheFunctions } from "@foxxmd/regex-buddy-core";

export interface TransformerCommonConfig {
    data?: Record<string, any>
    options?: {
        failOnFetch?: boolean
        throwOnFailure?: boolean | ('artists' | 'title' | 'albumArtists' | 'album')[]
    }
}

export interface TransformerCommon extends TransformerCommonConfig {
    regexCache?: ReturnType<typeof cacheFunctions>
}

export default abstract class AbstractTransformer<Y, T = any> extends AbstractInitializable {

    declare config: TransformerCommonConfig;

    regexCache: ReturnType<typeof cacheFunctions>

    protected constructor(config: TransformerCommon) {
        super(config);
        this.regexCache = config.regexCache ?? getRoot().items.cache().regexCache;
    }

    public async handle(parts: PlayTransformParts<Y>, play: PlayObject): Promise<PlayObject> {

        if (parts.when !== undefined) {
            if (!testWhenConditions(parts.when, play, { testMaybeRegex: this.regexCache.testMaybeRegex })) {
                this.logger.debug('When condition not met, returning original Play');
                return play;
            }
        }

        const {
            failOnFetch = false,
            throwOnFailure = false,
        } = this.config.options || {};

        let transformData: T;
        try {
            transformData = await this.getTransformerData(play);
        } catch (e) {
            if (failOnFetch) {
                throw new Error(`Could not fetch transformer data`, { cause: e });
            }
            this.logger.warn(new Error(`Could not fetch transformer data, returning original Play`, { cause: e }));
            return play;
        }

        try {
            await this.checkShouldTransform(play, transformData);
        } catch (e) {
            this.logger.debug(new Error('checkShouldTransform did not pass, returning original Play', { cause: e }));
            return play;
        }

        const transformedPlayData: Partial<ObjectPlayData> = {};

        if (parts.title !== undefined) {
            try {
                const title = await this.handleTitle(play, parts.title, transformData);
                transformedPlayData.track = title;
            } catch (e) {
                const err = new Error(`Failed to transform title: ${play.data.track}`, { cause: e });
                if (throwOnFailure === true || (throwOnFailure !== false && throwOnFailure.includes('title'))) {
                    throw err;
                } else {
                    this.logger.warn(err);
                }
            }
        }

        if (parts.artists !== undefined) {
            try {
                const artists = await this.handleArtists(play, parts.artists, transformData);
                transformedPlayData.artists = artists;
            } catch (e) {
                const err = new Error(`Failed to transform artists`, { cause: e });
                if (throwOnFailure === true || (throwOnFailure !== false && throwOnFailure.includes('artists'))) {
                    throw err;
                } else {
                    this.logger.warn(err);
                }
            }

            try {
                const albumArtists = await this.handleAlbumArtists(play, parts.artists, transformData);
                transformedPlayData.albumArtists = albumArtists;
            } catch (e) {
                const err = new Error(`Failed to transform album artists`, { cause: e });
                if (throwOnFailure === true || (throwOnFailure !== false && throwOnFailure.includes('albumArtists'))) {
                    throw err;
                } else {
                    this.logger.warn(err);
                }
            }
        }

        if (parts.album !== undefined) {
            try {
                const album = await this.handleTitle(play, parts.album, transformData);
                transformedPlayData.album = album;
            } catch (e) {
                const err = new Error(`Failed to transform album: ${play.data.album}`, { cause: e });
                if (throwOnFailure === true || (throwOnFailure !== false && throwOnFailure.includes('album'))) {
                    throw err;
                } else {
                    this.logger.warn(err);
                }
            }
        }

        const transformedPlay = {
            ...play,
            data: {
                ...play.data,
                ...transformedPlayData
            }
        }

        return transformedPlay;
    }

    public async getTransformerData(play: PlayObject): Promise<T> {
        return undefined;
    }

    public async checkShouldTransform(play: PlayObject, transformData: T): Promise<void> {
        return;
    }

    protected abstract handleTitle(play: PlayObject, parts: Y, transformData: T): Promise<string | undefined>;
    protected abstract handleArtists(play: PlayObject, parts: Y, transformData: T): Promise<string[] | undefined>;
    protected abstract handleAlbumArtists(play: PlayObject, parts: Y, transformData: T): Promise<string[] | undefined>;
    protected abstract handleAlbum(play: PlayObject, parts: Y, transformData: T): Promise<string | undefined>;

    protected async handleMeta(play: PlayObject, transformData: T): Promise<TrackMeta | undefined> {
        return play.data.meta;
    }
}