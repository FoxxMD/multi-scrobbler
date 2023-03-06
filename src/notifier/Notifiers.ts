import {config, format, Logger} from "winston";
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
import {EventEmitter} from "events";

export class Notifiers {

    logger: Logger;

    webhooks: AbstractWebhookNotifier[] = [];

    emitter: EventEmitter;

    clientEmitter: EventEmitter;
    sourceEmitter: EventEmitter;

    constructor(emitter: EventEmitter, clientEmitter: EventEmitter, sourceEmitter: EventEmitter) {
        this.emitter = emitter;
        this.clientEmitter = clientEmitter;
        this.sourceEmitter = sourceEmitter;

        this.logger = createLabelledLogger('Notifiers', 'Notifiers');

        this.sourceEmitter.on('notify', async (payload: WebhookPayload) => {
            await this.notify(payload);
        })
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
            if(webhook.initialized) {
                await webhook.testAuth();
            }
            this.webhooks.push(webhook);
        }
    }

    notify = async (payload: WebhookPayload) => {
        for (const webhook of this.webhooks) {
            await webhook.notify(payload);
        }
    }
}
