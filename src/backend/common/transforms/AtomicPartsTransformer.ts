import { ObjectPlayData, PlayObject, TrackMeta } from "../../../core/Atomic.js";
import { AtomicStageConfig, StageConfig } from "../infrastructure/Transform.js";
import AbstractTransformer from "./AbstractTransformer.js";

//export type GenericAtomicStageConfig<A> = 

export default abstract class AtomicPartsTransformer<Y, T = any, Z extends AtomicStageConfig<Y> = StageConfig> extends AbstractTransformer<T, Z> {

        protected async doHandle(parts: Z, play: PlayObject, transformData: T): Promise<PlayObject> {
    
            const {
                throwOnFailure = false,
            } = this.config.options || {};
    
            try {
                await this.checkShouldTransform(play, transformData, parts);
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
    
            const transformedPlay = {
                ...play,
                data: {
                    ...play.data,
                    ...transformedPlayData
                }
            }
    
            return transformedPlay;
        }
    
        public async getTransformerData(play: PlayObject, stageConfig: Z): Promise<T> {
            return undefined;
        }
    
        public async checkShouldTransform(play: PlayObject, transformData: T, stageConfig: Z): Promise<void> {
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