import * as z from "zod";
import {pollingOptionsSchema} from "../common.ts";
import {commonSourceConfigSchema, commonSourceDataSchema} from "./index.ts";

export const subsonicDataSchema = z.object({
    ...commonSourceDataSchema.shape,
    ...pollingOptionsSchema.shape,
    /**
     * URL of the subsonic media server to query
     *
     * @examples ["http://airsonic.local"]
     * */
    url: z.string().meta({
        description: "URL of the subsonic media server to query",
        examples: ["http://airsonic.local"]
    }),
    /**
     * Username to login to the server with
     *
     * @example ["MyUser"]
     * */
    user: z.string().meta({
        description: "Username to login to the server with"
    }),

    /**
    * Password for the user to login to the server with
     *
     * @examples ["MyPassword"]
    * */
    password: z.string().meta({
        description: "Password for the user to login to the server with",
        examples: ["MyPassword"]
    }),

    /**
     * How long to wait before polling the source API for new tracks (in seconds)
     *
     * @default 10
     * @examples [10]
     * */
    interval: z.number().optional().meta({
        description: "How long to wait before polling the source API for new tracks (in seconds)",
        default: 10,
        examples: [10]
    }),

    /**
     * When there has been no new activity from the Source API multi-scrobbler will gradually increase the wait time between polling up to this value (in seconds)
     *
     * @default 30
     * @examples [30]
     * */
    maxInterval: z.number().optional().meta({
        description: "When there has been no new activity from the Source API multi-scrobbler will gradually increase the wait time between polling up to this value (in seconds)",
        default: 30,
        examples: [30]
    }),

    /**
     * If your subsonic server is using self-signed certs you may need to disable TLS errors in order to get a connection
     *
     * WARNING: This should be used with caution as your traffic may not be encrypted.
     *
     * @default false
     * */
    ignoreTlsErrors: z.boolean().optional().meta({
        description: "If your subsonic server is using self-signed certs you may need to disable TLS errors in order to get a connection",
        default: false
    }),

    /**
     * Older Subsonic versions, and some badly implemented servers (Nextcloud), use legacy authentication which sends your password in CLEAR TEXT. This is less secure than the newer, recommended hashing authentication method but in some cases it is needed. See "Authentication" section here => https://www.subsonic.org/pages/api.jsp
     *
     * If this option is not specified it will be turned on if the subsonic server responds with error code 41 "Token authentication not supported for LDAP users." -- See Error Handling section => https://www.subsonic.org/pages/api.jsp
     *
     * @default false
     * */
    legacyAuthentication: z.boolean().optional().meta({
        description: "Older Subsonic versions, and some badly implemented servers (Nextcloud), use legacy authentication which sends your password in CLEAR TEXT.",
        default: false
    }),

    /**
     * Only scrobble for specific users (case-insensitive)
     *
     * If undefined or an empty string/list MS will scrobble activity from all users
     * */
    usersAllow: z.union([z.string(), z.array(z.string())]).optional().meta({
        description: "Only scrobble for specific users (case-insensitive)"
    }),

    /**
     * Ignore `getNowPlaying` entries whose `minutesAgo`-derived start time is older than their reported duration.
     *
     * This fallback is used only when the active client does not report OpenSubsonic Playback Report state or position. It prevents servers that retain stale now-playing entries after playback stops from repeatedly scrobbling the same track. Can be disabled if the server properly reports no playing songs when playback is stopped.
     *
     * @default true
     * */
     detectStaleNowPlayingFromMinutesAgo: z.boolean().optional().meta({description: 'Ignore `getNowPlaying` entries whose `minutesAgo`-derived start time is older than their reported duration.\n\n Only used when server/client does not implement OpenSubsonic Playback Report'})
});

export type SubsonicData = z.infer<typeof subsonicDataSchema>;

export const subSonicSourceConfigSchema = z.object({
    ...commonSourceConfigSchema.shape,
    data: subsonicDataSchema,
});

export type SubSonicSourceConfig = z.infer<typeof subSonicSourceConfigSchema>;

export const subsonicSourceAIOConfigSchema = z.object({
    ...subSonicSourceConfigSchema.shape,
    type: z.literal('subsonic'),
}).meta({title: 'Subsonic'});

export type SubsonicSourceAIOConfig = z.infer<typeof subsonicSourceAIOConfigSchema>;
