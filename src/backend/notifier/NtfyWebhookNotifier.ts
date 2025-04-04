import { Logger } from "@foxxmd/logging";
import { Config, publish } from 'ntfy';
import request from "superagent";
import { NtfyConfig, PrioritiesConfig, WebhookPayload } from "../common/infrastructure/config/health/webhooks.ts";
import { AbstractWebhookNotifier } from "./AbstractWebhookNotifier.ts";
import { URLData } from "../../core/Atomic.ts";
import { isPortReachable, normalizeWebAddress } from "../utils/NetworkUtils.ts";

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
