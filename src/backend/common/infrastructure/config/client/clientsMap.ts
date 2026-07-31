import type { KoitoClientAIOConfig, KoitoClientConfig} from "./koito.ts";
import type { LastfmClientAIOConfig, LastfmClientConfig} from "./lastfm.ts";
import type { ListenBrainzClientAIOConfig, ListenBrainzClientConfig} from "./listenbrainz.ts";
import type { MalojaClientAIOConfig, MalojaClientConfig} from "./maloja.ts";
import type { TealClientAIOConfig, TealClientConfig} from "./tealfm.ts";
import type { RockSkyClientAIOConfig, RockSkyClientConfig} from "./rocksky.ts";
import type { LibrefmClientAIOConfig, LibrefmClientConfig} from "./librefm.ts";
import type { DiscordClientAIOConfig, DiscordClientConfig} from "./discord.ts";
import type { ClientAIOConfig } from "./clients.ts";
import type { CommonClientConfig, EnvClientSchema } from "./index.ts";
import type {ZodType, ZodObject} from 'zod';
import type { ClientType } from "../../../../../core/Atomic.ts";
import { SimpleError } from "../../../errors/MSErrors.ts";


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

export const clientConfigSchemaMapAsync: { [K in keyof ClientTypeConfigMap]:() => Promise<[ZodType<ClientTypeConfigMap[K][0]>,ZodType<ClientTypeConfigMap[K][1]>,EnvClientSchema<ZodObject, ClientTypeConfigMap[K][0]>]> } = {
    maloja: async() => {
        const {malojaClientConfigSchema, malojaClientAIOConfigSchema, envSchemas} = (await import('./maloja.ts'));
        return [malojaClientConfigSchema,malojaClientAIOConfigSchema,envSchemas]
    },
    lastfm: async() => {
        const {lastfmClientConfigSchema, lastfmClientAIOConfigSchema, envSchemas} = (await import('./lastfm.ts'));
        return [lastfmClientConfigSchema,lastfmClientAIOConfigSchema,envSchemas]
    },
    librefm: async() => {
        const {librefmClientConfigSchema, librefmClientAIOConfigSchema, envSchemas} = (await import('./librefm.ts'));
        return [librefmClientConfigSchema,librefmClientAIOConfigSchema,envSchemas]
    },
    listenbrainz: async() => {
        const {listenBrainzClientConfigSchema, listenBrainzClientAIOConfigSchema, envSchemas} = (await import('./listenbrainz.ts'));
        return [listenBrainzClientConfigSchema,listenBrainzClientAIOConfigSchema,envSchemas]
    },
    koito: async() => {
        const {koitoClientConfigSchema, koitoClientAIOConfigSchema, envSchemas} = (await import('./koito.ts'));
        return [koitoClientConfigSchema,koitoClientAIOConfigSchema,envSchemas]
    },
    tealfm: async() => {
        const {tealClientConfigSchema, tealClientAIOConfigSchema, envSchemas} = (await import('./tealfm.ts'));
        return [tealClientConfigSchema,tealClientAIOConfigSchema,envSchemas]
    },
    rocksky: async() => {
        const {rockSkyClientConfigSchema, rockSkyClientAIOConfigSchema, envSchemas} = (await import('./rocksky.ts'));
        return [rockSkyClientConfigSchema,rockSkyClientAIOConfigSchema,envSchemas]
    },
    discord: async() => {
        const {discordClientConfigSchema, discordClientAIOConfigSchema, envSchemas} = (await import('./discord.ts'));
        return [discordClientConfigSchema,discordClientAIOConfigSchema,envSchemas]
    }
}

export const validateClientJson = async <T extends keyof ClientTypeConfigMap>(clientType: T, json: object): Promise<ClientTypeConfigMap[T][0]> => {
    if(clientConfigSchemaMapAsync[clientType] === undefined) {
        throw new SimpleError(`No Client has a 'type' of '${clientType}'`);
    }
    return (await clientConfigSchemaMapAsync[clientType]())[0].parse(json);
}
export const validateClientAIOJson = async <T extends keyof ClientTypeConfigMap>(clientType: T, json: object): Promise<ClientTypeConfigMap[T][1]> => {
    if(clientConfigSchemaMapAsync[clientType] === undefined) {
        throw new SimpleError(`No Client has a 'type' of '${clientType}'`);
    }
    return (await clientConfigSchemaMapAsync[clientType]())[1].parse(json);
}
export const getClientEnvSchema = async <T extends keyof ClientTypeConfigMap>(clientType: T): Promise<EnvClientSchema<ZodObject, ClientTypeConfigMap[T][0]>> => {
    if(clientConfigSchemaMapAsync[clientType] === undefined) {
        throw new SimpleError(`No Client has a 'type' of '${clientType}'`);
    }
    return (await clientConfigSchemaMapAsync[clientType]())[2];
};