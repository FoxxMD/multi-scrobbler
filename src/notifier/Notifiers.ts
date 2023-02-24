import {config, Logger} from "winston";
import {createLabelledLogger} from "../utils.js";
import {
    GotifyConfig,
    NtfyConfig,
    WebhookConfig,
    WebhookPayload
} from "../common/infrastructure/config/health/webhooks.js";
import {AbstractWebhookNotifier} from "./AbstractWebhookNotifier.js";
import {GotifyWebhookNotifier} from "./GotifyWebhookNotifier.js";
import {NtfyWebhookNotifier} from "./NtfyWebhookNotifier.js";

export class Notifiers {

    logger: Logger;

    webhooks: AbstractWebhookNotifier[];

    constructor() {
        this.logger = createLabelledLogger('Notifiers', 'Notifiers');
    }

    buildWebhooks = async (webhookConfigs: WebhookConfig[]) => {
        for (const [i, config] of Object.entries(webhookConfigs)) {
            let webhook: AbstractWebhookNotifier;
            const defaultName = `Config ${i}`
            switch (config.type) {
                case 'gotify':
                    webhook = new GotifyWebhookNotifier(defaultName, config as GotifyConfig);
                    break;
                case 'ntfy':
                    webhook = new NtfyWebhookNotifier(defaultName, config as NtfyConfig);
                    break;
                default:
                    this.logger.error(`'${config.type}' is not a valid webhook type`);
                    continue;
            }
            await webhook.initialize();
            this.webhooks.push(webhook);
        }
    }

    notify = async (payload: WebhookPayload) => {
        for (const webhook of this.webhooks) {
            await webhook.notify(payload);
        }
    }
}
