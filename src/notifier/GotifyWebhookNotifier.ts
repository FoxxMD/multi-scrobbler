import {AbstractWebhookNotifier} from "./AbstractWebhookNotifier.js";
import {GotifyConfig, PrioritiesConfig, WebhookPayload} from "../common/infrastructure/config/health/webhooks.js";
import gotify from 'gotify';

export class GotifyWebhookNotifier extends AbstractWebhookNotifier {

    declare config: GotifyConfig;

    priorities: PrioritiesConfig;

    constructor(defaultName: string, config: GotifyConfig) {
        super('Gotify', defaultName, config);
        const {
            info = 5,
            warn = 7,
            error = 10
        } = this.config.priorities || {};

        this.priorities = {
            info,
            warn,
            error
        }

    }

    notify = async (payload: WebhookPayload) => {
        try {
            await gotify.gotify({
                server: this.config.url,
                app: this.config.token,
                message: payload.message,
                title: payload.title,
                priority: this.priorities[payload.priority]
            });
            this.logger.debug(`Pushed notification.`);
        } catch (e: any) {
            this.logger.error(`Failed to push notification: ${e.message}`)
        }
    }

}
