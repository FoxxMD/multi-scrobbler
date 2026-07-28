import * as z from "zod";
import {koitoClientAIOConfigSchema, koitoClientConfigSchema, type KoitoClientAIOConfig, type KoitoClientConfig} from "./koito.ts";
import {lastfmClientAIOConfigSchema, lastfmClientConfigSchema, type LastfmClientAIOConfig, type LastfmClientConfig} from "./lastfm.ts";
import {listenBrainzClientAIOConfigSchema, listenBrainzClientConfigSchema, type ListenBrainzClientAIOConfig, type ListenBrainzClientConfig} from "./listenbrainz.ts";
import {malojaClientAIOConfigSchema, malojaClientConfigSchema, type MalojaClientAIOConfig, type MalojaClientConfig} from "./maloja.ts";
import {tealClientAIOConfigSchema, tealClientConfigSchema, type TealClientAIOConfig, type TealClientConfig} from "./tealfm.ts";
import {rockSkyClientAIOConfigSchema, rockSkyClientConfigSchema, type RockSkyClientAIOConfig, type RockSkyClientConfig} from "./rocksky.ts";
import {librefmClientAIOConfigSchema, librefmClientConfigSchema, type LibrefmClientAIOConfig, type LibrefmClientConfig} from "./librefm.ts";
import {discordClientAIOConfigSchema, discordClientConfigSchema, type DiscordClientAIOConfig, type DiscordClientConfig} from "./discord.ts";
import type { CommonClientConfig } from "./index.ts";
import type { ClientType } from "../../../../../core/Atomic.ts";
import { SimpleError } from "../../../errors/MSErrors.ts";

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

export interface ClientTypeConfigMap extends Record<ClientType, [CommonClientConfig, ClientAIOConfig]> {
    maloja: [MalojaClientConfig,MalojaClientAIOConfig],
    lastfm: [LastfmClientConfig,LastfmClientAIOConfig],
    librefm: [LibrefmClientConfig,LibrefmClientAIOConfig],
    listenbrainz: [ListenBrainzClientConfig,ListenBrainzClientAIOConfig],
    koito: [KoitoClientConfig,KoitoClientAIOConfig],
    tealfm: [TealClientConfig,TealClientAIOConfig],
    rocksky: [RockSkyClientConfig,RockSkyClientAIOConfig],
    discord: [DiscordClientConfig,DiscordClientAIOConfig]
}

export const clientConfigSchemaMap: { [K in keyof ClientTypeConfigMap]: [z.ZodType<ClientTypeConfigMap[K][0]>,z.ZodType<ClientTypeConfigMap[K][1]>] } = {
    maloja: [malojaClientConfigSchema,malojaClientAIOConfigSchema],
    lastfm: [lastfmClientConfigSchema,lastfmClientAIOConfigSchema],
    librefm: [librefmClientConfigSchema,librefmClientAIOConfigSchema],
    listenbrainz: [listenBrainzClientConfigSchema,listenBrainzClientAIOConfigSchema],
    koito: [koitoClientConfigSchema,koitoClientAIOConfigSchema],
    tealfm: [tealClientConfigSchema,tealClientAIOConfigSchema],
    rocksky: [rockSkyClientConfigSchema,rockSkyClientAIOConfigSchema],
    discord: [discordClientConfigSchema,discordClientAIOConfigSchema]
}

export const validateClientJson = <T extends keyof ClientTypeConfigMap>(clientType: T, json: object): ClientTypeConfigMap[T][0] => {
    if(clientConfigSchemaMap[clientType] === undefined) {
        throw new SimpleError(`No Client has a 'type' of '${clientType}'`);
    }
    return clientConfigSchemaMap[clientType][0].parse(json);
}
export const validateClientAIOJson = <T extends keyof ClientTypeConfigMap>(clientType: T, json: object): ClientTypeConfigMap[T][1] => {
    if(clientConfigSchemaMap[clientType] === undefined) {
        throw new SimpleError(`No Client has a 'type' of '${clientType}'`);
    }
    return clientConfigSchemaMap[clientType][1].parse(json);
}