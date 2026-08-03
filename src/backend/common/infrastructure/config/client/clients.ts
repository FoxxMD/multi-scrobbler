import * as z from "zod";
import {koitoClientAIOConfigSchema, koitoClientConfigSchema} from "./koito.ts";
import {lastfmClientAIOConfigSchema, lastfmClientConfigSchema} from "./lastfm.ts";
import {listenBrainzClientAIOConfigSchema, listenBrainzClientConfigSchema} from "./listenbrainz.ts";
import {malojaClientAIOConfigSchema, malojaClientConfigSchema} from "./maloja.ts";
import {tealClientAIOConfigSchema, tealClientConfigSchema} from "./tealfm.ts";
import {rockSkyClientAIOConfigSchema, rockSkyClientConfigSchema} from "./rocksky.ts";
import {librefmClientAIOConfigSchema, librefmClientConfigSchema} from "./librefm.ts";
import {discordClientAIOConfigSchema, discordClientConfigSchema} from "./discord.ts";

export const clientConfigSchema = z.union([
    malojaClientConfigSchema,
    lastfmClientConfigSchema,
    librefmClientConfigSchema,
    listenBrainzClientConfigSchema,
    koitoClientConfigSchema,
    tealClientConfigSchema,
    rockSkyClientConfigSchema,
    discordClientConfigSchema,
]);

export type ClientConfig = z.infer<typeof clientConfigSchema>;

export const clientAIOConfigSchema = z.union([
    malojaClientAIOConfigSchema,
    lastfmClientAIOConfigSchema,
    librefmClientAIOConfigSchema,
    listenBrainzClientAIOConfigSchema,
    koitoClientAIOConfigSchema,
    tealClientAIOConfigSchema,
    rockSkyClientAIOConfigSchema,
    discordClientAIOConfigSchema,
]);

export type ClientAIOConfig = z.infer<typeof clientAIOConfigSchema>;