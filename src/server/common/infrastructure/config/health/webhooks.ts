export interface WebhookPayload {
    title?: string
    message: string
    priority: 'info' | 'warn' | 'error'
}

export interface PrioritiesConfig {
    /**
     * @examples [5]
     * */
    info: number
    /**
     * @examples [7]
     * */
    warn: number
    /**
     * @examples [10]
     * */
    error: number
}

export interface CommonWebhookConfig {
    /**
     * Webhook type. Valid values are:
     *
     * * gotify
     * * ntfy
     *
     * @examples ["gotify"]
     * */
    type: 'gotify' | 'ntfy'
    /**
     * A friendly name used to identify webhook config in logs
     * */
    name?: string
}

export interface GotifyConfig extends CommonWebhookConfig {
    /**
     * The URL of the Gotify server. Same URL that would be used to reach the Gotify UI
     *
     * @examples ["http://192.168.0.100:8078"]
     * */
    url: string
    /**
     * The token created for this Application in Gotify
     *
     * @examples ["AQZI58fA.rfSZbm"]
     * */
    token: string
    /**
     * Priority of messages
     *
     * * Info -> 5
     * * Warn -> 7
     * * Error -> 10
     * */
    priorities?: PrioritiesConfig
}

export interface NtfyConfig extends CommonWebhookConfig {
    /**
     * The URL of the Ntfy server
     *
     * @examples ["http://192.168.0.100:8078"]
     * */
    url: string

    /**
     * The topic mutli-scrobbler should POST to
     * */
    topic: string

    /**
     * Required if topic is protected
     * */
    username?: string
    /**
     * Required if topic is protected
     * */
    password?: string

    /**
     * Priority of messages
     *
     * * Info -> 3
     * * Warn -> 4
     * * Error -> 5
     * */
    priorities?: PrioritiesConfig
}

export type WebhookConfig = GotifyConfig | NtfyConfig;
