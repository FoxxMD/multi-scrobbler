import { Logger } from "@foxxmd/logging";
import { HTTPError } from "got";
import { gotify } from 'gotify';
import request from 'superagent';
import { GotifyConfig, PrioritiesConfig, WebhookPayload } from "../common/infrastructure/config/health/webhooks.js";
import { AbstractWebhookNotifier } from "./AbstractWebhookNotifier.js";

export class GotifyWebhookNotifier extends AbstractWebhookNotifier {

    declare config: GotifyConfig;

    priorities: PrioritiesConfig;

    constructor(defaultName: string, config: GotifyConfig, logger: Logger) {
        super('Gotify', defaultName, config, logger);
        this.requiresAuth = true;
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

    initialize = async () => {
        // check url is correct
        try {
            const url = this.config.url;
            const resp = await request.get(`${url}/version`);
            this.logger.verbose(`Initialized. Found Server version ${resp.body.version}`);
            this.initialized = true;
        } catch (e) {
            this.logger.error(`Failed to contact server | Error: ${e.message}`);
        }
    }

    testAuth = async () => {
        this.authed = true;
        // TODO no easy way to test token is working without also pushing a message -- instead will de-auth if we get the right error message when trying to push for the first time
    }

    doNotify = async (payload: WebhookPayload) => {
        try {
            await gotify({
                server: this.config.url,
                app: this.config.token,
                message: payload.message,
                title: payload.title,
                priority: this.priorities[payload.priority]
            });
            this.logger.verbose(`Pushed notification.`);
        } catch (e: any) {
            if(e instanceof HTTPError && e.response.statusCode === 401) {
                this.logger.warn(`Unable to push notification. Error returned with 401 which means the TOKEN provided is probably incorrect. Disabling Notifier | Error => ${e.response.body}`);
                this.authed = false;
            } else {
                this.logger.warn(`Failed to push notification | Error => ${e.message}`);
            }
        }
    }
}
