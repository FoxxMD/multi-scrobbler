import * as z from "zod";
import {koitoClientAIOConfigSchema, koitoClientConfigSchema, type KoitoClientConfig} from "./koito.ts";
import {lastfmClientAIOConfigSchema, lastfmClientConfigSchema, type LastfmClientConfig} from "./lastfm.ts";
import {listenBrainzClientAIOConfigSchema, listenBrainzClientConfigSchema, type ListenBrainzClientConfig} from "./listenbrainz.ts";
import {malojaClientAIOConfigSchema, malojaClientConfigSchema, type MalojaClientConfig} from "./maloja.ts";
import {tealClientAIOConfigSchema, tealClientConfigSchema, type TealClientConfig} from "./tealfm.ts";
import {rockSkyClientAIOConfigSchema, rockSkyClientConfigSchema, type RockSkyClientConfig} from "./rocksky.ts";
import {librefmClientAIOConfigSchema, librefmClientConfigSchema, type LibrefmClientConfig} from "./librefm.ts";
import {discordClientAIOConfigSchema, discordClientConfigSchema, type DiscordClientConfig} from "./discord.ts";
import type { CommonClientConfig } from "./index.ts";
import type { ClientType } from "../../../../../core/Atomic.ts";

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

export interface ClientTypeConfigMap extends Record<ClientType, CommonClientConfig> {
    maloja: MalojaClientConfig,
    lastfm: LastfmClientConfig,
    librefm: LibrefmClientConfig,
    listenbrainz: ListenBrainzClientConfig,
    koito: KoitoClientConfig,
    tealfm: TealClientConfig,
    rocksky: RockSkyClientConfig,
    discord: DiscordClientConfig
}

const clientConfigSchemaMap: { [K in keyof ClientTypeConfigMap]: z.ZodType<ClientTypeConfigMap[K]> } = {
    maloja: malojaClientConfigSchema,
    lastfm: lastfmClientConfigSchema,
    librefm: librefmClientConfigSchema,
    listenbrainz: listenBrainzClientConfigSchema,
    koito: koitoClientConfigSchema,
    tealfm: tealClientConfigSchema,
    rocksky: rockSkyClientConfigSchema,
    discord: discordClientConfigSchema
}

export const validateClientJson = <T extends keyof ClientTypeConfigMap>(clientType: T, json: object): ClientTypeConfigMap[T] => clientConfigSchemaMap[clientType].parse(json);