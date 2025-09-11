import { Logger } from "@foxxmd/logging";
import { Config, publish } from 'ntfy';
import request from "superagent";
import {redactString} from '@foxxmd/redact-string';
import { NtfyConfig, PrioritiesConfig, WebhookPayload } from "../common/infrastructure/config/health/webhooks.js";
import { AbstractWebhookNotifier } from "./AbstractWebhookNotifier.js";
import { URLData } from "../../core/Atomic.js";
import { isPortReachable, normalizeWebAddress } from "../utils/NetworkUtils.js";

export class NtfyWebhookNotifier extends AbstractWebhookNotifier {

    declare config: NtfyConfig;

    priorities: PrioritiesConfig;

    protected endpoint: URLData;

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
        // check url is correct as a courtesy
        this.endpoint = normalizeWebAddress(this.config.url);
        this.logger.verbose(`Config URL: '${this.config.url}' => Normalized: '${this.endpoint.normal}'`);
        if(this.config.token !== undefined) {
            this.logger.verbose(`Using Access Token '${redactString(this.config.token, 3)}' for authentication`);
        } else if(this.config.username !== undefined) {
            this.logger.verbose(`Using Username/Password '${redactString(this.config.username, 3)}/${redactString(this.config.password, 3)}' for authentication`);
        } else {
            this.logger.verbose('No authentication provided, will not be able to push to protected topics');
        }

        this.initialized = true; // always set as ready to go. Server issues may be transient.

        try {
            await isPortReachable(this.endpoint.port, { host: this.endpoint.url.hostname });
        } catch (e) {
            this.logger.warn(new Error('Unable to detect if server is reachable', { cause: e }));
            return;
        }

        try {
            const url = this.config.url;
            const resp = await request.get(`${url}/v1/health`);
            if(resp.body !== undefined && typeof resp.body === 'object') {
                const {health} = resp.body;
                if(health === false) {
                    this.logger.warn('Found server but it responded that it was not ready.')
                    return;
                }
            } else {
                this.logger.warn(`Found server but expected a response with 'health' in payload. Found => ${resp.body}`);
                return;
            }
            this.logger.info('Found Ntfy server');
        } catch (e) {
            this.logger.error(new Error('Failed to contact server', {cause: e}));
        }
    }

    doNotify = async (payload: WebhookPayload) => {
        try {
            const req: Config = {
                message: payload.message,
                topic: this.config.topic,
                title: payload.title,
                server: this.endpoint.normal,
                priority: this.priorities[payload.priority],
            };
            if(this.config.token !== undefined) {
                req.authorization = this.config.token;
            } else if (this.config.username !== undefined) {
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
