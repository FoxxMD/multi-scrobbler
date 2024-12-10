import { Logger } from "@foxxmd/logging";
import { HTTPError } from "got";
import { gotify } from 'gotify';
import request from 'superagent';
import { GotifyConfig, PrioritiesConfig, WebhookPayload } from "../common/infrastructure/config/health/webhooks.js";
import { AbstractWebhookNotifier } from "./AbstractWebhookNotifier.js";
import { isPortReachable, normalizeWebAddress } from "../utils/NetworkUtils.js";
import { URLData } from "../../core/Atomic.js";

export class GotifyWebhookNotifier extends AbstractWebhookNotifier {

    declare config: GotifyConfig;

    priorities: PrioritiesConfig;

    protected endpoint: URLData;

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
        // check url is correct as a courtesy
        this.endpoint = normalizeWebAddress(this.config.url);
        this.logger.verbose(`Config URL: '${this.config.url}' => Normalized: '${this.endpoint.normal}'`)

        this.initialized = true; // always set as ready to go. Server issues may be transient.

        try {
            await isPortReachable(this.endpoint.port, { host: this.endpoint.url.hostname });
        } catch (e) {
            this.logger.warn(new Error('Unable to detect if server is reachable', { cause: e }));
            return;
        }

        try {
            const url = this.config.url;
            const resp = await request.get(`${url}/version`);
            this.logger.verbose(`Found Server version ${resp.body.version}`);
        } catch (e) {
            this.logger.warn(new Error('Server was reachable but could not determine version', { cause: e }));
        }
    }

    testAuth = async () => {
        this.authed = true;
        // TODO no easy way to test token is working without also pushing a message -- instead will de-auth if we get the right error message when trying to push for the first time
    }

    doNotify = async (payload: WebhookPayload) => {
        try {
            await gotify({
                server: this.endpoint.normal,
                app: this.config.token,
                message: payload.message,
                title: payload.title,
                priority: this.priorities[payload.priority]
            });
            this.logger.verbose(`Pushed notification.`);
        } catch (e) {
            if(e instanceof HTTPError && e.response.statusCode === 401) {
                this.logger.warn(new Error(`Unable to push notification. Error returned with 401 which means the TOKEN provided is probably incorrect. Disabling Notifier \n Response Error => ${e.response.body}`, {cause: e}));
                this.authed = false;
            } else {
                this.logger.warn(new Error('Failed to push notification', {cause: e}));
            }
        }
    }
}
