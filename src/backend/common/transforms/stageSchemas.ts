import * as z from "zod";
import type { Logger } from "@foxxmd/logging";
import type { CommonClientOptions } from "../infrastructure/config/client/index.ts";
import type { CommonSourceOptions } from "../infrastructure/config/source/index.ts";
import { loggerNoop } from "../MaybeLogger.ts";
import { buildPlayTransformSchema } from "../../../core/Transform.ts";
import { userStageSchema } from "./UserTransformer.ts";
import { nativeStageSchema } from "./NativeTransformer.ts";
import { musicbrainzStageSchema } from "./musicbrainz/MusicbrainzTransformerUtil.ts";
import { rockskyStageSchema } from "./rocksky/RockskyTransformerUtil.ts";
import { spotifyStageSchema } from "./spotify/SpotifyTransformerUtil.ts";
import { coverArtArchiveStageSchema } from "./coverartarchive/CoverArtArchiveTransformerUtil.ts";

/** Every Stage usable in a Hook. Each Stage's schema lives next to its Transformer -- add new Stages here. */
export const stageSchema = z.discriminatedUnion('type', [
    userStageSchema,
    nativeStageSchema,
    musicbrainzStageSchema,
    rockskyStageSchema,
    spotifyStageSchema,
    coverArtArchiveStageSchema,
]).meta({title: 'Stage'});

export type Stage = z.output<typeof stageSchema>;
export type StageType = Stage['type'];

export const STAGE_TYPES = stageSchema.options.map(x => x.shape.type.value) as StageType[];

/** `playTransform` in Source/Client options */
export const playTransformSchema = buildPlayTransformSchema(stageSchema);

export type PlayTransformConfig = z.input<typeof playTransformSchema>;

/** Build `playTransform` with a preCompare hook of Stages (by type) from ENV `[prefix]_TRANSFORMS` */
export const transformPresetEnv = <T extends CommonClientOptions | CommonSourceOptions>(prefix: string, existing: T | undefined = undefined, logger: Logger = loggerNoop): undefined | T => {

    const env = process.env[`${prefix}_TRANSFORMS`];
    if (env === undefined || env.trim() === '') {
        return existing;
    }

    const preCompare: Extract<PlayTransformConfig['preCompare'], unknown[]> = [];
    const popts: PlayTransformConfig = {
        preCompare
    };
    const transformTypes = env.split(',').map(x => x.trim().toLocaleLowerCase());
    for (const p of transformTypes) {
        // user stage is meaningless without rules
        if(p !== 'user' && (STAGE_TYPES as string[]).includes(p)) {
            preCompare.push({type: p as Exclude<typeof STAGE_TYPES[number], 'user'>});
        } else {
            logger.warn(`Unrecognized transformer type '${p} in env ${env}'`);
        }
    }

    // @ts-expect-error T is fine
    return {
        ...(existing || {}),
        playTransform: popts
    };
};
