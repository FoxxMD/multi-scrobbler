import { Logger } from "@foxxmd/logging";
import { Config, publish } from 'ntfy';
import request from "superagent";
import { NtfyConfig, PrioritiesConfig, WebhookPayload } from "../common/infrastructure/config/health/webhooks.js";
import { AbstractWebhookNotifier } from "./AbstractWebhookNotifier.js";

export class NtfyWebhookNotifier extends AbstractWebhookNotifier {

    declare config: NtfyConfig;

    priorities: PrioritiesConfig;

    constructor(defaultName: string, config: NtfyConfig, logger: Logger) {
        super('Ntfy', defaultName, config, logger);
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
            const req: Config = {
                message: payload.message,
                topic: this.config.topic,
                title: payload.title,
                server: this.config.url,
                priority: this.priorities[payload.priority],
            };
            if (this.config.username !== undefined) {
                req.authorization = {
                    username: this.config.username,
                    password: this.config.password,
                }
            }
            await publish(req);
            this.logger.verbose(`Pushed notification.`);
        } catch (e: any) {
            this.logger.warn(`Failed to push notification: ${e.message}`)
        }
    }

}
