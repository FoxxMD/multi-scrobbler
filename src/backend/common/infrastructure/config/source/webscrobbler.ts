import * as z from "zod";
import {commonSourceConfigSchema, commonSourceDataSchema} from "./index.ts";

export const webScrobblerDataSchema = z.object({
    ...commonSourceDataSchema.shape,
    /**
     * The URL ending that should be used to identify scrobbles for this source
     *
     * In WebScrobbler's Webhook you must set an 'API URL'. All MS WebScrobbler sources must start like:
     *
     * http://localhost:9078/api/webscrobbler
     *
     * If you are using multiple WebScrobbler sources (scrobbles for many users) you must use a slug to match Sources with each users extension.
     *
     * Example:
     *
     * * slug: 'usera' => API URL: http://localhost:9078/api/webscrobbler/usera
     * * slug: 'userb' => API URL: http://localhost:9078/api/webscrobbler/userb
     *
     * If no slug is found from an extension's incoming webhook event the first WebScrobbler source without a slug will be used
     * */
    slug: z.union([z.string(), z.null()]).optional().meta({
        description: "The URL ending that should be used to identify scrobbles for this source"
    }),

    /**
     * Block scrobbling from specific WebScrobbler Connectors
     *
     * @examples ["youtube"]
     * */
    blacklist: z.union([z.string(), z.array(z.string())]).optional().meta({
        description: "Block scrobbling from specific WebScrobbler Connectors",
        examples: ["youtube"]
    }),

    /**
     * Only allow scrobbling from specific WebScrobbler Connectors
     *
     * @examples ["mixcloud","soundcloud","bandcamp"]
     * */
    whitelist: z.union([z.string(), z.array(z.string())]).optional().meta({
        description: "Only allow scrobbling from specific WebScrobbler Connectors",
        examples: ["mixcloud", "soundcloud", "bandcamp"]
    }),
});

export type WebScrobblerData = z.infer<typeof webScrobblerDataSchema>;

export const webScrobblerSourceConfigSchema = z.object({
    ...commonSourceConfigSchema.shape,
    data: webScrobblerDataSchema.optional(),
});

export type WebScrobblerSourceConfig = z.infer<typeof webScrobblerSourceConfigSchema>;

export const webScrobblerSourceAIOConfigSchema = z.object({
    ...webScrobblerSourceConfigSchema.shape,
    type: z.literal('webscrobbler'),
});

export type WebScrobblerSourceAIOConfig = z.infer<typeof webScrobblerSourceAIOConfigSchema>;
