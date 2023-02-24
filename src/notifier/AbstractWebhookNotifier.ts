import {GotifyConfig, NtfyConfig, WebhookPayload} from "../common/infrastructure/config/health/webhooks.js";
import {Logger} from "winston";
import {createLabelledLogger} from "../utils.js";

export abstract class AbstractWebhookNotifier {

    config: GotifyConfig | NtfyConfig
    logger: Logger;

    initialized: boolean = false;

    protected constructor(type: string, defaultName: string, config: GotifyConfig | NtfyConfig) {
        this.config = config;
        const label = `${type} - ${config.name ?? defaultName}`
        this.logger = createLabelledLogger(label, label);
    }

    initialize = async () => {
        this.initialized = true;
        this.logger.verbose('Initialized');
    }

    abstract notify: (payload: WebhookPayload) => Promise<any>;
}
