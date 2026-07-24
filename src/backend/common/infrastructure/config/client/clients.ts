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

/** Used for docusaurus schemas
 *  We need to show "array of" for each type of config when looking at File Config
 *
 *  This is defined in the AIO config and we *assume* arrays in individual files when parsing in builders
 *  But we don't have any actual definitions for this that we can pull for generating individual schema files
 */
export const malojaClientConfigsSchema = z.array(malojaClientConfigSchema);

export type MalojaClientConfigs = z.infer<typeof malojaClientConfigsSchema>;

export const lastfmClientConfigsSchema = z.array(lastfmClientConfigSchema);

export type LastfmClientConfigs = z.infer<typeof lastfmClientConfigsSchema>;

export const librefmClientConfigsSchema = z.array(librefmClientConfigSchema);

export type LibrefmClientConfigs = z.infer<typeof librefmClientConfigsSchema>;

export const listenBrainzClientConfigsSchema = z.array(listenBrainzClientConfigSchema);

export type ListenBrainzClientConfigs = z.infer<typeof listenBrainzClientConfigsSchema>;

export const koitoClientConfigsSchema = z.array(koitoClientConfigSchema);

export type KoitoClientConfigs = z.infer<typeof koitoClientConfigsSchema>;

export const tealClientConfigsSchema = z.array(tealClientConfigSchema);

export type TealClientConfigs = z.infer<typeof tealClientConfigsSchema>;

export const rockSkyClientConfigsSchema = z.array(rockSkyClientConfigSchema);

export type RockSkyClientConfigs = z.infer<typeof rockSkyClientConfigsSchema>;

export const discordClientConfigsSchema = z.array(discordClientConfigSchema);

export type DiscordClientConfigs = z.infer<typeof discordClientConfigsSchema>;

export const atomicClientInterfaces = [
    'MalojaClientConfig',
    'LastfmClientConfig',
    'LibrefmClientConfig',
    'ListenBrainzClientConfig',
    'KoitoClientConfig',
    'TealClientConfig',
    'RockSkyClientConfig',
    'DiscordClientConfig'
];

export const clientInterfaces = [
    'AIOClientRelaxedConfig',
    ...atomicClientInterfaces
];
