import { childLogger, Logger } from '@foxxmd/logging';
import { EventEmitter } from "events";
import {
    AppriseConfig,
    GotifyConfig,
    NtfyConfig,
    WebhookConfig,
    WebhookPayload
} from "../common/infrastructure/config/health/webhooks.js";
import { AbstractWebhookNotifier } from "./AbstractWebhookNotifier.js";
import { AppriseWebhookNotifier } from "./AppriseWebhookNotifier.js";
import { GotifyWebhookNotifier } from "./GotifyWebhookNotifier.js";
import { NtfyWebhookNotifier } from "./NtfyWebhookNotifier.js";

export class Notifiers {

    logger: Logger;

    webhooks: AbstractWebhookNotifier[] = [];

    emitter: EventEmitter;

    clientEmitter: EventEmitter;
    sourceEmitter: EventEmitter;

    constructor(emitter: EventEmitter, clientEmitter: EventEmitter, sourceEmitter: EventEmitter, parentLogger: Logger) {
        this.emitter = emitter;
        this.clientEmitter = clientEmitter;
        this.sourceEmitter = sourceEmitter;

        this.logger = childLogger(parentLogger, 'Notifiers');

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
                    webhook = new GotifyWebhookNotifier(defaultName, config as GotifyConfig, this.logger);
                    break;
                case 'ntfy':
                    webhook = new NtfyWebhookNotifier(defaultName, config as NtfyConfig, this.logger);
                    break;
                case 'apprise':
                    webhook = new AppriseWebhookNotifier(defaultName, config as AppriseConfig, this.logger);
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
