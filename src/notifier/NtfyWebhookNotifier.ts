import {AbstractWebhookNotifier} from "./AbstractWebhookNotifier.js";
import {
    NtfyConfig,
    PrioritiesConfig,
    WebhookPayload
} from "../common/infrastructure/config/health/webhooks.js";
import {publish} from 'ntfy';
import request from "superagent";

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

    initialize = async () => {
        // check url is correct
        try {
            const url = this.config.url;
            const resp = await request.get(`${url}/v1/health`);
            if(resp.body !== undefined && typeof resp.body === 'object') {
                const {health} = resp.body;
                if(health === false) {
                    this.logger.error('Found Ntfy server but it responded that it was not ready.')
                    return;
                }
            } else {
                this.logger.error(`Found Ntfy server but expected a response with 'health' in payload. Found => ${resp.body}`);
                return;
            }
            this.logger.info('Initialized. Found Ntfy server');
            this.initialized = true;
        } catch (e) {
            this.logger.error(`Failed to contact Ntfy server | Error: ${e.message}`);
        }
    }

    doNotify = async (payload: WebhookPayload) => {
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
