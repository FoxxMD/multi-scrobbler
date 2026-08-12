import * as z from "zod";
import { httpUrl } from "../../../../utils/ZodUtils.ts";

export interface WebhookPayload {
    title?: string
    identifier: string
    message: string
    priority: Priority
}

export type Priority = 'info' | 'warn' | 'error';

export const prioritiesConfigSchema = z.object({
    /**
     * @examples [5]
     * */
    info: z.number().meta({
        examples: [5]
    }),
    /**
     * @examples [7]
     * */
    warn: z.number().meta({
        examples: [7]
    }),
    /**
     * @examples [10]
     * */
    error: z.number().meta({
        examples: [10]
    }),
});

export type PrioritiesConfig = z.infer<typeof prioritiesConfigSchema>;

export const commonWebhookConfigSchema = z.object({
    /**
     * Webhook type. Valid values are:
     *
     * * gotify
     * * ntfy
     *
     * @examples ["gotify"]
     * */
    type: z.union([z.literal('gotify'), z.literal('ntfy'), z.literal('apprise')]).meta({
        description: "Webhook type. Valid values are:",
        examples: ["gotify"]
    }),
    /**
     * A friendly name used to identify webhook config in logs
     * */
    name: z.string().optional().meta({
        description: "A friendly name used to identify webhook config in logs"
    }),
});

export type CommonWebhookConfig = z.infer<typeof commonWebhookConfigSchema>;

export const gotifyConfigSchema = z.object({
    ...commonWebhookConfigSchema.shape,
    /**
     * The URL of the Gotify server. Same URL that would be used to reach the Gotify UI
     *
     * @examples ["http://192.168.0.100:8078"]
     * */
    url: z.string().meta({
        description: "The URL of the Gotify server.",
        examples: ["http://192.168.0.100:8078"]
    }),
    /**
     * The token created for this Application in Gotify
     *
     * @examples ["AQZI58fA.rfSZbm"]
     * */
    token: z.string().meta({
        description: "The token created for this Application in Gotify",
        examples: ["AQZI58fA.rfSZbm"]
    }),
    /**
     * Priority of messages
     *
     * * Info -> 5
     * * Warn -> 7
     * * Error -> 10
     * */
    priorities: prioritiesConfigSchema.optional().meta({
        description: "Priority of messages"
    }),
});

export type GotifyConfig = z.infer<typeof gotifyConfigSchema>;

export const ntfyConfigSchema = z.object({
    ...commonWebhookConfigSchema.shape,
    /**
     * The URL of the Ntfy server
     *
     * @examples ["http://192.168.0.100:8078"]
     * */
    url: httpUrl.meta({
        description: "The URL of the Ntfy server",
        examples: ["http://192.168.0.100:8078"]
    }),

    /**
     * The topic mutli-scrobbler should POST to
     * */
    topic: z.string().meta({
        description: "The topic mutli-scrobbler should POST to"
    }),

    /**
     * Required if topic is protected
     * */
    username: z.string().optional().meta({
        description: "Required if topic is protected"
    }),
    /**
     * Required if topic is protected
     * */
    password: z.string().optional().meta({
        description: "Required if topic is protected"
    }),

    /**
     * Use instead of username/password, required if topic is protected
     */
    token: z.string().optional().meta({
        description: "Use instead of username/password, required if topic is protected"
    }),

    /**
     * Priority of messages
     *
     * * Info -> 3
     * * Warn -> 4
     * * Error -> 5
     * */
    priorities: prioritiesConfigSchema.optional().meta({
        description: "Priority of messages"
    }),
});

export type NtfyConfig = z.infer<typeof ntfyConfigSchema>;

export const appriseConfigSchema = z.object({
    ...commonWebhookConfigSchema.shape,
    /**
     * The URL of the apprise-api server
     *
     * @examples ["http://192.168.0.100:8078"]
     * */
    host: httpUrl.meta({
        description: "The URL of the apprise-api server",
        examples: ["http://192.168.0.100:8078"]
    }),

    /**
     * If using [Stateless Endpoints](https://github.com/caronc/apprise-api?tab=readme-ov-file#stateless-solution) the Apprise config URL(s) to send
     * */
    urls: z.union([z.string(), z.array(z.string())]).optional().meta({
        description: "If using [Stateless Endpoints](https://github.com/caronc/apprise-api?tab=readme-ov-file#stateless-solution) the Apprise config URL(s) to send"
    }),

    /**
     * If using [Persistent Store Endpoints](https://github.com/caronc/apprise-api?tab=readme-ov-file#persistent-storage-solution) the Configuration ID(s) to send to
     *
     * Note: If multiple keys are defined then MS will attempt to POST to each one individually
     * */
    keys: z.union([z.string(), z.array(z.string())]).optional().meta({
        description: "If using [Persistent Store Endpoints](https://github.com/caronc/apprise-api?tab=readme-ov-file#persistent-storage-solution) the Configuration ID(s) to send to"
    }),

    /**
     * Optional [tag(s)](https://github.com/caronc/apprise-api?tab=readme-ov-file#tagging) to send in the notification payload
     * */
    tags: z.union([z.string(), z.array(z.string())]).optional().meta({
        description: "Optional [tag(s)](https://github.com/caronc/apprise-api?tab=readme-ov-file#tagging) to send in the notification payload"
    }),
});

export type AppriseConfig = z.infer<typeof appriseConfigSchema>;

export const webhookConfigSchema = z.union([gotifyConfigSchema, ntfyConfigSchema, appriseConfigSchema]);

export type WebhookConfig = z.infer<typeof webhookConfigSchema>;
