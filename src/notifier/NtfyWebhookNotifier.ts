import {AbstractWebhookNotifier} from "./AbstractWebhookNotifier.js";
import {
    NtfyConfig,
    PrioritiesConfig,
    WebhookPayload
} from "../common/infrastructure/config/health/webhooks.js";
import {publish} from 'ntfy';

export class NtfyWebhookNotifier extends AbstractWebhookNotifier {

    declare config: NtfyConfig;

    priorities: PrioritiesConfig;

    constructor(defaultName: string, config: NtfyConfig) {
        super('Ntfy', defaultName, config);
        const {
            info = 3,
            warn = 4,
            error = 5
        } = this.config.priorities || {};

        this.priorities = {
            info,
            warn,
            error
        }

    }

    notify = async (payload: WebhookPayload) => {
        try {
            let authorization = {};
            if (this.config.username !== undefined) {
                authorization = {
                    username: this.config.username,
                    password: this.config.password,
                }
            }
            await publish({
                message: payload.message,
                topic: this.config.topic,
                title: payload.title,
                server: this.config.url,
                priority: this.priorities[payload.priority],
                ...authorization,
            });
            this.logger.debug(`Pushed notification.`);
        } catch (e: any) {
            this.logger.error(`Failed to push notification: ${e.message}`)
        }
    }

}
