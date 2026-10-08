import { type Credit, isPlayObject, type ObjectPlayData, type PlayObject, type TrackMeta, type TrackMetaIsrc } from "../../../core/Atomic.ts";
import type {AtomicStageConfig, PlayTransformPartsAtomic, StageConfig} from "../../../core/Transform.ts";
import AbstractTransformer from "./AbstractTransformer.ts";
import { testWhenConditions } from "../../utils/PlayTransformUtils.ts";
import type { CreditRules } from "../../../core/MusicMetadata.ts";

type PartName = keyof PlayTransformPartsAtomic<unknown>;

export default abstract class AtomicPartsTransformer<Y, T = any, Z extends AtomicStageConfig<Y> = StageConfig> extends AbstractTransformer<T, Z> {

        /**
         * Does this transformer add metadata (service ids) or images to credits?
         *
         * When false credit handlers are only called when their own rule is enabled, `meta` and `art` rules are never passed to them.
         */
        protected readonly hydratesCredits: boolean = false;

        /** A rule is enabled if it is defined, not false, and any `when` condition it has is met */
        protected ruleEnabled(play: PlayObject, name: PartName, part: unknown): boolean {
            if (part === undefined || part === null || part === false) {
                return false;
            }
            if (typeof part === 'object' && !Array.isArray(part) && 'when' in part && part.when !== undefined) {
                if (!testWhenConditions(part.when as Parameters<typeof testWhenConditions>[0], play, { testMaybeRegex: this.regex.testMaybeRegex })) {
                    this.logger.debug(`When condition for ${name} not met, will not use it`);
                    return false;
                }
            }
            return true;
        }

        protected async doHandle(parts: Z, play: PlayObject, transformData: T): Promise<PlayObject> {

            const {
                throwOnFailure = false,
            } = this.config.options || {};

            const transformedPlayData: Partial<ObjectPlayData> = {};

            const enabled = (name: PartName) => this.ruleEnabled(play, name, parts[name]);

            const metaEnabled = enabled('meta');
            const meta = this.hydratesCredits && metaEnabled;
            const art = this.hydratesCredits && enabled('art');

            const attempt = async (names: PartName[], desc: string, fn: () => Promise<void>) => {
                try {
                    await fn();
                } catch (e) {
                    const err = new Error(`Failed to transform ${desc}`, { cause: e });
                    if (throwOnFailure === true || (throwOnFailure !== false && names.some(x => throwOnFailure.includes(x)))) {
                        throw err;
                    }
                    this.logger.warn(err);
                }
            }

            // credit handlers also apply metadata and images so they run, and fail, for any of these rules
            const handleCredit = async (part: PartName, desc: string, fn: (rules: CreditRules) => Promise<void>) => {
                const rules: CreditRules = { name: enabled(part), meta, art };
                if (!rules.name && !meta && !art) {
                    return;
                }
                const names: PartName[] = [];
                if (rules.name) {
                    names.push(part);
                }
                if (meta) {
                    names.push('meta');
                }
                if (art) {
                    names.push('art');
                }
                await attempt(names, desc, () => fn(rules));
            }

            await handleCredit('title', `title: ${play.data.track?.name}`, async (rules) => {
                transformedPlayData.track = await this.handleTitle(play, parts.title as Y, transformData, rules);
            });
            await handleCredit('artists', 'artists', async (rules) => {
                transformedPlayData.artists = await this.handleArtists(play, parts.artists as Y, transformData, rules);
            });
            await handleCredit('albumArtists', 'album artists', async (rules) => {
                transformedPlayData.albumArtists = await this.handleAlbumArtists(play, parts.albumArtists as Y, transformData, rules);
            });
            await handleCredit('album', `album: ${play.data.album?.name}`, async (rules) => {
                transformedPlayData.album = await this.handleAlbum(play, parts.album as Y, transformData, rules);
            });

            if (enabled('duration')) {
                await attempt(['duration'], `duration: ${play.data.duration}`, async () => {
                    transformedPlayData.duration = await this.handleDuration(play, parts.duration as Y, transformData);
                });
            }

            if (metaEnabled) {
                await attempt(['meta'], 'meta', async () => {
                    const handledMeta = await this.handleMeta(play, parts.meta as Y, transformData);
                    if (handledMeta === undefined) {
                        return;
                    }
                    const { isrc, ...metaSources } = handledMeta;
                    // shallow merge each meta source (brainz...) with existing
                    const mergedMeta: Record<string, object | undefined> = { ...(play.data.meta ?? {}) };
                    for (const [k, v] of Object.entries(metaSources)) {
                        if (v !== undefined) {
                            mergedMeta[k] = { ...mergedMeta[k], ...v };
                        }
                    }
                    transformedPlayData.meta = mergedMeta as TrackMeta;
                    // if (isrc !== undefined) {
                    //     transformedPlayData.isrc = isrc;
                    // }
                });
            }

            const transformedPlay = {
                ...play,
                data: {
                    ...play.data,
                    ...transformedPlayData,
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

        /*
         * Credit handlers return the final credit(s) for their property.
         *
         * They are called if their own rule is enabled (`rules.name`) or, for transformers that hydrate credits, if `meta` or `art` rules are enabled.
         * `parts` is undefined if the property has no rule.
         */
        protected abstract handleTitle(play: PlayObject, parts: Y, transformData: T, rules: CreditRules): Promise<Credit | undefined>;
        protected abstract handleArtists(play: PlayObject, parts: Y, transformData: T, rules: CreditRules): Promise<Credit[] | undefined>;
        protected abstract handleAlbumArtists(play: PlayObject, parts: Y, transformData: T, rules: CreditRules): Promise<Credit[] | undefined>;
        protected abstract handleAlbum(play: PlayObject, parts: Y, transformData: T, rules: CreditRules): Promise<Credit | undefined>;

        /** Only called if `duration` rule is enabled */
        protected async handleDuration(play: PlayObject, parts: Y, transformData: T): Promise<number | undefined> {
            return play.data.duration;
        }

        /**
         * Data that does not belong to a credit. Metadata (service ids) for credits is applied by the credit handlers.
         *
         * Only called if `meta` rule is enabled
         * */
        protected async handleMeta(play: PlayObject, parts: Y, transformData: T): Promise<TrackMetaIsrc | undefined> {
            return undefined;
        }

}
