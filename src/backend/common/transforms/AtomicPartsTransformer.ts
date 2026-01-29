import { isPlayObject, ObjectPlayData, PlayObject, TrackMeta } from "../../../core/Atomic.js";
import { AtomicStageConfig, StageConfig } from "../infrastructure/Transform.js";
import AbstractTransformer from "./AbstractTransformer.js";

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

            const mergedMeta = {
                ...(play.data.meta ?? {})
            };
            if (parts.meta !== undefined) {
                try {
                    const meta = await this.handleMeta(play, parts.duration, transformData);

                    if (meta !== undefined) {
                        for (const [k, v] of Object.entries(meta)) {
                            if (mergedMeta[k] !== undefined) {
                                mergedMeta[k] = {
                                    ...mergedMeta[k],
                                    ...v
                                }
                            } else {
                                mergedMeta[k] = v;
                            }
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

            const transformedPlay = {
                ...play,
                data: {
                    ...play.data,
                    ...transformedPlayData,
                    meta: mergedMeta
                }
            }

            if(typeof transformData === 'object' && isPlayObject(transformData) && transformData.meta?.lifecycleInputs !== undefined) {
                const {
                    meta: {
                        lifecycleInputs = [],
                    } = {},
                } = transformedPlay;
                transformedPlay.meta.lifecycleInputs = lifecycleInputs.concat(transformData.meta?.lifecycleInputs);
            }

            return transformedPlay;
        }
    
        protected abstract handleTitle(play: PlayObject, parts: Y, transformData: T): Promise<string | undefined>;
        protected abstract handleArtists(play: PlayObject, parts: Y, transformData: T): Promise<string[] | undefined>;
        protected abstract handleAlbumArtists(play: PlayObject, parts: Y, transformData: T): Promise<string[] | undefined>;
        protected abstract handleAlbum(play: PlayObject, parts: Y, transformData: T): Promise<string | undefined>;
        protected async handleDuration(play: PlayObject, parts: Y, transformData: T): Promise<number | undefined> {
            return play.data.duration;
        }
    
        protected async handleMeta(play: PlayObject, parts: Y, transformData: T): Promise<TrackMeta | undefined> {
            return play.data.meta;
        }

}