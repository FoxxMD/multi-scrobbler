import * as z from "zod";
import {koitoClientAIOConfigSchema, koitoClientConfigSchema, envSchemas as koitoEnvSchemas, type KoitoClientAIOConfig, type KoitoClientConfig} from "./koito.ts";
import {lastfmClientAIOConfigSchema, lastfmClientConfigSchema, envSchemas as lastfmEnvSchemas, type LastfmClientAIOConfig, type LastfmClientConfig} from "./lastfm.ts";
import {listenBrainzClientAIOConfigSchema, listenBrainzClientConfigSchema, envSchemas as listenBrainzEnvSchemas, type ListenBrainzClientAIOConfig, type ListenBrainzClientConfig} from "./listenbrainz.ts";
import {malojaClientAIOConfigSchema, malojaClientConfigSchema, envSchemas as malojaEnvSchemas, type MalojaClientAIOConfig, type MalojaClientConfig} from "./maloja.ts";
import {tealClientAIOConfigSchema, tealClientConfigSchema, envSchemas as tealEnvSchemas, type TealClientAIOConfig, type TealClientConfig} from "./tealfm.ts";
import {rockSkyClientAIOConfigSchema, rockSkyClientConfigSchema, envSchemas as rockSkyEnvSchemas, type RockSkyClientAIOConfig, type RockSkyClientConfig} from "./rocksky.ts";
import {librefmClientAIOConfigSchema, librefmClientConfigSchema, envSchemas as librefmEnvSchemas, type LibrefmClientAIOConfig, type LibrefmClientConfig} from "./librefm.ts";
import {discordClientAIOConfigSchema, discordClientConfigSchema, envSchemas as discordEnvSchemas, type DiscordClientAIOConfig, type DiscordClientConfig} from "./discord.ts";
import type { CommonClientConfig, EnvClientSchema } from "./index.ts";
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

export interface ClientTypeConfigMap extends Record<ClientType, [CommonClientConfig, ClientAIOConfig, Partial<Pick<CommonClientConfig, 'data' | 'options'>>]> {
    maloja: [MalojaClientConfig,MalojaClientAIOConfig, Partial<Pick<MalojaClientConfig, 'data' | 'options'>>],
    lastfm: [LastfmClientConfig,LastfmClientAIOConfig, Partial<Pick<LastfmClientConfig, 'data' | 'options'>>],
    librefm: [LibrefmClientConfig,LibrefmClientAIOConfig, Partial<Pick<LibrefmClientConfig, 'data' | 'options'>>],
    listenbrainz: [ListenBrainzClientConfig,ListenBrainzClientAIOConfig, Partial<Pick<ListenBrainzClientConfig, 'data' | 'options'>>],
    koito: [KoitoClientConfig,KoitoClientAIOConfig, Partial<Pick<KoitoClientConfig, 'data' | 'options'>>],
    tealfm: [TealClientConfig,TealClientAIOConfig, Partial<Pick<TealClientConfig, 'data' | 'options'>>],
    rocksky: [RockSkyClientConfig,RockSkyClientAIOConfig, Partial<Pick<RockSkyClientConfig, 'data' | 'options'>>],
    discord: [DiscordClientConfig,DiscordClientAIOConfig, Partial<Pick<DiscordClientConfig, 'data' | 'options'>>]
}

export const clientConfigSchemaMap: { [K in keyof ClientTypeConfigMap]: [z.ZodType<ClientTypeConfigMap[K][0]>,z.ZodType<ClientTypeConfigMap[K][1]>,EnvClientSchema<z.ZodObject, ClientTypeConfigMap[K][0]>] } = {
    maloja: [malojaClientConfigSchema,malojaClientAIOConfigSchema,malojaEnvSchemas],
    lastfm: [lastfmClientConfigSchema,lastfmClientAIOConfigSchema,lastfmEnvSchemas],
    librefm: [librefmClientConfigSchema,librefmClientAIOConfigSchema,librefmEnvSchemas],
    listenbrainz: [listenBrainzClientConfigSchema,listenBrainzClientAIOConfigSchema,listenBrainzEnvSchemas],
    koito: [koitoClientConfigSchema,koitoClientAIOConfigSchema,koitoEnvSchemas],
    tealfm: [tealClientConfigSchema,tealClientAIOConfigSchema,tealEnvSchemas],
    rocksky: [rockSkyClientConfigSchema,rockSkyClientAIOConfigSchema,rockSkyEnvSchemas],
    discord: [discordClientConfigSchema,discordClientAIOConfigSchema,discordEnvSchemas]
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