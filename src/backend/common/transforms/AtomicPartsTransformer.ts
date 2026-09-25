import { type ArtistCredit, type ArtMeta, isPlayObject, type ObjectPlayData, type PlayObject, type TrackMetaIsrc } from "../../../core/Atomic.ts";
import type {AtomicStageConfig, StageConfig} from "../../../core/Transform.ts";
import AbstractTransformer from "./AbstractTransformer.ts";

//export type GenericAtomicStageConfig<A> = 

export default abstract class AtomicPartsTransformer<Y, T = any, Z extends AtomicStageConfig<Y> = StageConfig> extends AbstractTransformer<T, Z> {

        protected async doHandle(parts: Z, play: PlayObject, transformData: T): Promise<PlayObject> {
    
            const {
                throwOnFailure = false,
            } = this.config.options || {};
    
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
            }

            if(parts.albumArtists !== undefined) {
                try {
                    const albumArtists = await this.handleAlbumArtists(play, parts.albumArtists, transformData);
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
                    const album = await this.handleAlbum(play, parts.album, transformData);
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

            let mergedMeta: TrackMetaIsrc | undefined; 
            if (parts.meta !== undefined) {
                try {
                    const meta = await this.handleMeta(play, parts.meta, transformData);

                    if (meta !== undefined) {
                        mergedMeta = {
                            ...(play.data.meta ?? {})
                        };
                        const {isrc, ...metaSources} = meta;
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

            let mergedArt: ArtMeta | undefined;
            if (parts.art !== undefined) {
                try {
                    const art = await this.handleArt(play, parts.art, transformData);

                    if (art !== undefined) {
                        mergedArt = {
                            ...(play.meta?.art ?? {})
                        };
                        // art values are url strings so new values replace existing
                        for (const [k, v] of Object.entries(art) as [keyof ArtMeta, string | undefined][]) {
                            if (v !== undefined) {
                                mergedArt[k] = v;
                            }
                        }
                    }
                } catch (e) {
                    const err = new Error(`Failed to transform art: ${JSON.stringify(play.meta?.art)}`, { cause: e });
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
            if(mergedArt !== undefined) {
                transformedPlay.meta.art = mergedArt;
            }

            if(typeof transformData === 'object' && isPlayObject(transformData as object) && (transformData as PlayObject).meta?.lifecycleInputs !== undefined) {
                const {
                    meta: {
                        lifecycleInputs = [],
                    } = {},
                } = transformedPlay;
                transformedPlay.meta.lifecycleInputs = lifecycleInputs.concat((transformData as PlayObject).meta?.lifecycleInputs!);
            }

            return transformedPlay;
        }
    
        protected abstract handleTitle(play: PlayObject, parts: Y, transformData: T): Promise<string | undefined>;
        protected abstract handleArtists(play: PlayObject, parts: Y, transformData: T): Promise<ArtistCredit[] | undefined>;
        protected abstract handleAlbumArtists(play: PlayObject, parts: Y, transformData: T): Promise<ArtistCredit[] | undefined>;
        protected abstract handleAlbum(play: PlayObject, parts: Y, transformData: T): Promise<string | undefined>;
        protected async handleDuration(play: PlayObject, parts: Y, transformData: T): Promise<number | undefined> {
            return play.data.duration;
        }
    
        protected async handleMeta(play: PlayObject, parts: Y, transformData: T): Promise<TrackMetaIsrc | undefined> {
            return undefined;
        }

        protected async handleArt(play: PlayObject, parts: Y, transformData: T): Promise<ArtMeta | undefined> {
            return undefined;
        }

}