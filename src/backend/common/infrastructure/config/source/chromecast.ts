import * as z from "zod";
import {commonSourceConfigSchema, commonSourceDataSchema, type EnvSourceSchema} from "./index.ts";
import { transformSplitMaybeString } from "../../../../utils/ZodUtils.ts";

export const chromecastDeviceInfoSchema = z.object({
    /**
     * A friendly name to identify this device
     *
     * @examples ["MySmartTV"]
     * */
    name: z.string().meta({
        description: "A friendly name to identify this device",
        examples: ["MySmartTV"]
    }),
    /**
     * The IP address of the device
     *
     * @examples ["192.168.0.115"]
     * */
    address: z.string().meta({
        description: "The IP address of the device",
        examples: ["192.168.0.115"]
    }),
});

export type ChromecastDeviceInfo = z.infer<typeof chromecastDeviceInfoSchema>;

export const chromecastDataSchema = z.object({
    ...commonSourceDataSchema.shape,
    /**
     * DO NOT scrobble from any cast devices that START WITH these values, case-insensitive
     *
     * Useful when used with auto discovery
     *
     * @examples [["home-mini","family-tv"]]
     * */
    blacklistDevices: z.union([z.string(), z.array(z.string())]).optional().meta({
        description: "DO NOT scrobble from any cast devices that START WITH these values, case-insensitive",
        examples: [["home-mini", "family-tv"]]
    }),

    /**
     * ONLY scrobble from any cast device that START WITH these values, case-insensitive
     *
     * If whitelist is present then blacklist is ignored
     *
     * Useful when used with auto discovery
     *
     * @examples [["home-mini","family-tv"]]
     * */
    whitelistDevices: z.union([z.string(), z.array(z.string())]).optional().meta({
        description: "ONLY scrobble from any cast device that START WITH these values, case-insensitive",
        examples: [["home-mini", "family-tv"]]
    }),

    /**
     * DO NOT scrobble from any application that START WITH these values, case-insensitive
     *
     * @examples [["spotify","pandora"]]
     * */
    blacklistApps: z.union([z.string(), z.array(z.string())]).optional().meta({
        description: "DO NOT scrobble from any application that START WITH these values, case-insensitive",
        examples: [["spotify", "pandora"]]
    }),

    /**
     * ONLY scrobble from any application that START WITH these values, case-insensitive
     *
     * If whitelist is present then blacklist is ignored
     *
     * @examples [["spotify","pandora"]]
     * */
    whitelistApps: z.union([z.string(), z.array(z.string())]).optional().meta({
        description: "ONLY scrobble from any application that START WITH these values, case-insensitive",
        examples: [["spotify", "pandora"]]
    }),

    /**
     * Try to use Avahi and avahi-browse to resolve mDNS devices instead of native mDNS querying
     *
     * Useful for docker (alpine) container where mDNS resolution is not yet supported. Avahi socket must be exposed to the container and avahi-tools must be installed.
     *
     * @default false
     * */
    useAvahi: z.boolean().optional().meta({
        description: "Try to use Avahi and avahi-browse to resolve mDNS devices instead of native mDNS querying",
        default: false
    }),

    /**
     * Use mDNS to discovery Google Cast devices on your next automatically?
     *
     * If not explicitly set then it is TRUE if `devices` is not set
     * */
    useAutoDiscovery: z.union([z.boolean(), z.undefined()]).optional().meta({
        description: "Use mDNS to discovery Google Cast devices on your next automatically?"
    }),

    /**
     * A list of Google Cast devices to monitor
     *
     * If this is used then `useAutoDiscovery` is set to FALSE, if not explicitly set
     * */
    devices: z.array(chromecastDeviceInfoSchema).optional().meta({
        description: "A list of Google Cast devices to monitor"
    }),

    /**
     * Chromecast Apps report a "media type" in the status info returned for whatever is currently playing
     *
     * * If set to TRUE then Music AND Generic/Unknown media will be tracked for ALL APPS
     * * If set to FALSE then only media explicitly typed as Music will be tracked for ALL APPS
     * * If set to a list then only Apps whose name contain one of these values, case-insensitive, will have Music AND Generic/Unknown tracked
     *
     * See https://developers.google.com/cast/docs/media/messages#MediaInformation "metadata" property
     *
     * @default false
     * */
    allowUnknownMedia: z.union([z.boolean(), z.array(z.string())]).optional().meta({
        description: "Chromecast Apps report a \"media type\" in the status info returned for whatever is currently playing",
        default: false
    }),

    /**
     * Media provided by any App whose name is listed here will ALWAYS be tracked, regardless of the "media type" reported
     *
     * Apps will be recognized if they CONTAIN any of these values, case-insensitive
     * */
    forceMediaRecognitionOn: z.array(z.string()).optional().meta({
        description: "Media provided by any App whose name is listed here will ALWAYS be tracked, regardless of the \"media type\" reported"
    }),
});

export type ChromecastData = z.infer<typeof chromecastDataSchema>;

const envDataSchema = z.object({
    CC_BLACKLIST_DEVICES: z.string().optional().pipe(transformSplitMaybeString).meta(chromecastDataSchema.shape.blacklistDevices.meta()),
    CC_WHITELIST_DEVICES: z.string().optional().pipe(transformSplitMaybeString).meta(chromecastDataSchema.shape.whitelistDevices.meta()),
    CC_BLACKLIST_APPS: z.string().optional().pipe(transformSplitMaybeString).meta(chromecastDataSchema.shape.blacklistApps.meta()),
    CC_WHITELIST_APPS: z.string().optional().pipe(transformSplitMaybeString).meta(chromecastDataSchema.shape.whitelistApps.meta()),
});

export const envSchemas: EnvSourceSchema<typeof envDataSchema, ChromecastSourceConfig> = {
    env: envDataSchema,
    prefix: 'CC',
    toConfig: (partial) => ({
            data: {
                blacklistDevices: partial.CC_BLACKLIST_DEVICES,
                whitelistDevices: partial.CC_WHITELIST_DEVICES,
                blacklistApps: partial.CC_BLACKLIST_APPS,
                whitelistApps: partial.CC_WHITELIST_APPS
            }
    })
};

export const chromecastSourceConfigSchema = z.object({
    ...commonSourceConfigSchema.shape,
    data: chromecastDataSchema,
});

export type ChromecastSourceConfig = z.infer<typeof chromecastSourceConfigSchema>;

export const chromecastSourceAIOConfigSchema = z.object({
    ...chromecastSourceConfigSchema.shape,
    type: z.literal('chromecast'),
}).meta({title: 'Chromecast'});

export type ChromecastSourceAIOConfig = z.infer<typeof chromecastSourceAIOConfigSchema>;
