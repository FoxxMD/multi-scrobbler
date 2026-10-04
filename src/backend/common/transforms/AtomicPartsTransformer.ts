import { type Credit, isPlayObject, type ObjectPlayData, type PlayObject, type TrackData, type TrackMeta, type TrackMetaIsrc } from "../../../core/Atomic.ts";
import type {AtomicStageConfig, StageConfig} from "../../../core/Transform.ts";
import AbstractTransformer from "./AbstractTransformer.ts";
import { mergeCredit, mergeCredits, mergeCreditsMetadata, withImage, withMetadata } from "../../../core/MusicMetadata.ts";

/**
 * Non-credit data to apply to a play
 *
 * `credits` are used only for their metadata (service ids) which is added to the corresponding credits of the play, names are not changed
 */
export interface MetaParts extends TrackMetaIsrc {
    credits?: Pick<TrackData, 'track' | 'album' | 'artists' | 'albumArtists'>
}

/** Image urls to apply to the corresponding credits of a play */
export interface ArtParts {
    album?: string
    track?: string
    artist?: string
}

//export type GenericAtomicStageConfig<A> = 

export const artFromCredits = (data: Pick<TrackData, 'track' | 'album' | 'artists'>): ArtParts => ({
    track: data.track?.image,
    album: data.album?.image,
    artist: data.artists?.[0]?.image
});

export default abstract class AtomicPartsTransformer<Y, T = any, Z extends AtomicStageConfig<Y> = StageConfig> extends AbstractTransformer<T, Z> {

        protected async doHandle(parts: Z, play: PlayObject, transformData: T): Promise<PlayObject> {
    
            const {
                throwOnFailure = false,
            } = this.config.options || {};
    
            const transformedPlayData: Partial<ObjectPlayData> = {};
    
            if (parts.title !== undefined) {
                try {
                    const title = await this.handleTitle(play, parts.title, transformData);
                    transformedPlayData.track = title === undefined ? undefined : mergeCredit(play.data.track, title);
                } catch (e) {
                    const err = new Error(`Failed to transform title: ${play.data.track?.name}`, { cause: e });
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
                    transformedPlayData.artists = artists === undefined ? undefined : mergeCredits(play.data.artists, artists);
                } catch (e) {
                    const err = new Error(`Failed to transform artists`, { cause: e });
                    if (throwOnFailure === true || (throwOnFailure !== false && throwOnFailure.includes('artists'))) {
                        throw err;
                    } else {
                        this.logger.warn(err);
                    }
                }
            }

            if(parts.albumArtists !== undefined) {
                try {
                    const albumArtists = await this.handleAlbumArtists(play, parts.albumArtists, transformData);
                    transformedPlayData.albumArtists = albumArtists === undefined ? undefined : mergeCredits(play.data.albumArtists, albumArtists);
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
                    const album = await this.handleAlbum(play, parts.album, transformData);
                    transformedPlayData.album = album === undefined ? undefined : mergeCredit(play.data.album, album);
                } catch (e) {
                    const err = new Error(`Failed to transform album: ${play.data.album?.name}`, { cause: e });
                    if (throwOnFailure === true || (throwOnFailure !== false && throwOnFailure.includes('album'))) {
                        throw err;
                    } else {
                        this.logger.warn(err);
                    }
                }
            }

            if (parts.duration !== undefined) {
                try {
                    const duration = await this.handleDuration(play, parts.duration, transformData);
                    transformedPlayData.duration = duration;
                } catch (e) {
                    const err = new Error(`Failed to transform duration: ${play.data.duration}`, { cause: e });
                    if (throwOnFailure === true || (throwOnFailure !== false && throwOnFailure.includes('duration'))) {
                        throw err;
                    } else {
                        this.logger.warn(err);
                    }
                }
            }

            let mergedMeta: TrackMeta | undefined;
            let metaCredits: MetaParts['credits'];
            if (parts.meta !== undefined) {
                try {
                    const meta = await this.handleMeta(play, parts.meta, transformData);

                    if (meta !== undefined) {
                        mergedMeta = {
                            ...(play.data.meta ?? {})
                        };
                        const {isrc, credits, ...metaSources} = meta;
                        metaCredits = credits;
                        // shallow merge each meta source (brainz, spotify...) with existing
                        const mergeTarget = mergedMeta as Record<string, object | undefined>;
                        for (const [k, v] of Object.entries(metaSources)) {
                            if (v !== undefined) {
                                mergeTarget[k] = {...mergeTarget[k], ...v};
                            }
                        }
                        if(isrc !== undefined) {
                            transformedPlayData.isrc = isrc;
                        }
                    }
                } catch (e) {
                    const err = new Error(`Failed to transform meta: ${play.data.meta}`, { cause: e });
                    if (throwOnFailure === true || (throwOnFailure !== false && throwOnFailure.includes('meta'))) {
                        throw err;
                    } else {
                        this.logger.warn(err);
                    }
                }
            }

            let art: ArtParts | undefined;
            if (parts.art !== undefined) {
                try {
                    art = await this.handleArt(play, parts.art, transformData);
                } catch (e) {
                    const err = new Error(`Failed to transform art`, { cause: e });
                    if (throwOnFailure === true || (throwOnFailure !== false && throwOnFailure.includes('art'))) {
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
                    ...transformedPlayData,
                }
            }

            if(mergedMeta !== undefined) {
                transformedPlay.data.meta = mergedMeta;
            }
            if(metaCredits !== undefined) {
                const {track, album, artists, albumArtists} = transformedPlay.data;
                transformedPlay.data.track = withMetadata(track, ...(metaCredits.track?.metadata ?? []));
                transformedPlay.data.album = withMetadata(album, ...(metaCredits.album?.metadata ?? []));
                if(artists !== undefined) {
                    transformedPlay.data.artists = mergeCreditsMetadata(artists, metaCredits.artists);
                }
                if(albumArtists !== undefined) {
                    transformedPlay.data.albumArtists = mergeCreditsMetadata(albumArtists, metaCredits.albumArtists);
                }
            }
            if(art !== undefined) {
                // art values are url strings so new values replace existing
                const {track, album, artists} = transformedPlay.data;
                transformedPlay.data.track = withImage(track, art.track);
                transformedPlay.data.album = withImage(album, art.album);
                if(artists !== undefined && artists.length > 0) {
                    transformedPlay.data.artists = [withImage(artists[0], art.artist), ...artists.slice(1)];
                }
            }

            const transformInputs = typeof transformData === 'object' && isPlayObject(transformData as object) ? (transformData as PlayObject).meta?.lifecycleInputs : undefined;
            if(transformInputs !== undefined) {
                const {
                    meta: {
                        lifecycleInputs = [],
                    } = {},
                } = transformedPlay;
                transformedPlay.meta.lifecycleInputs = lifecycleInputs.concat(transformInputs);
            }

            return transformedPlay;
        }
    
        protected abstract handleTitle(play: PlayObject, parts: Y, transformData: T): Promise<Credit | undefined>;
        protected abstract handleArtists(play: PlayObject, parts: Y, transformData: T): Promise<Credit[] | undefined>;
        protected abstract handleAlbumArtists(play: PlayObject, parts: Y, transformData: T): Promise<Credit[] | undefined>;
        protected abstract handleAlbum(play: PlayObject, parts: Y, transformData: T): Promise<Credit | undefined>;
        protected async handleDuration(play: PlayObject, parts: Y, transformData: T): Promise<number | undefined> {
            return play.data.duration;
        }
    
        protected async handleMeta(play: PlayObject, parts: Y, transformData: T): Promise<MetaParts | undefined> {
            return undefined;
        }

        protected async handleArt(play: PlayObject, parts: Y, transformData: T): Promise<ArtParts | undefined> {
            return undefined;
        }

}