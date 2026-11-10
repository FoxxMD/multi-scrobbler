import * as z from "zod";
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
export type PlayTransformRules = z.output<typeof playTransformSchema>;
