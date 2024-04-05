import { Logger } from "@foxxmd/logging";
import request, { Request } from "superagent";
import { truncateStringToLength } from "../../core/StringUtils.js";
import { isSuperAgentResponseError } from "../common/errors/ErrorUtils.js";
import { isNodeNetworkException } from "../common/errors/NodeErrors.js";
import { UpstreamError } from "../common/errors/UpstreamError.js";
import {
    AppriseConfig,
    PrioritiesConfig,
    Priority,
    WebhookPayload
} from "../common/infrastructure/config/health/webhooks.js";
import { AbstractWebhookNotifier } from "./AbstractWebhookNotifier.js";

const shortKey = truncateStringToLength(10);

export class AppriseWebhookNotifier extends AbstractWebhookNotifier {

    declare config: AppriseConfig;

    priorities: PrioritiesConfig;

    urls: string[];
    keys: string[];

    constructor(defaultName: string, config: AppriseConfig, logger: Logger) {
        super('Apprise', defaultName, config, logger);
        const {
            urls = [],
            keys = [],
            host,
        } = this.config;
        if (host === undefined) {
            throw new Error(`'host' must be defined in configuration for this notification`);
        }
        this.urls = Array.isArray(urls) ? urls : [urls];
        this.keys = Array.isArray(keys) ? keys : [keys];

        if (this.urls.length === 0 && this.keys.length === 0) {
            this.logger.warn(`No 'urls' or 'keys' were defined! Will assume stateless (POST ${host}/notify) and that you have the ENV 'APPRISE_STATELESS_URLS' set on your Apprise instance`);
        }
    }

    initialize = async () => {
        // check url is correct
        try {
            await request.get(this.config.host);
        } catch (e) {
            this.logger.error(new Error('Failed to contact Apprise server', {cause: e}));
        }

        if (this.keys.length > 0) {
            let anyOk = false;
            for (const key of this.keys) {
                try {
                    const resp = await request.get(`${this.config.host}/json/urls/${key}`);
                    if (resp.statusCode === 204) {
                        this.logger.warn(`Details for Config ${shortKey(key)} returned no content. Double check the key is set correctly or that the apprise Config is not empty.`);
                    } else {
                        anyOk = true;
                    }
                } catch (e) {
                    this.logger.warn(new Error(`Failed to get details for Config ${shortKey(key)}`, {cause: e}));
                }
            }
            if (!anyOk) {
                this.logger.error('No Apprise Configs were valid!');
                this.initialized = false;
                return;
            }
        }
        this.initialized = true;
    }

    doNotify = async (payload: WebhookPayload) => {
        const body: Record<string, any> = {
            title: payload.title,
            body: payload.message,
            type: convertPriorityToType(payload.priority)
        }

        let anyOk = false;
        if (this.keys.length > 0) {
            for (const key of this.keys) {
                try {
                    const resp = await this.callApi(request.post(`${this.config.host}/notify/${key}`)
                        .type('json')
                        .send(body));
                    anyOk = true;
                    this.logger.debug(`Pushed notification to Config ${shortKey(key)}`);
                } catch (e: any) {
                    this.logger.warn(new Error(`Failed to push notification for '${payload.title}' to Config ${shortKey(key)}`, {cause: e}));
                }
            }
        }

        if (this.urls.length > 0 || this.keys.length === 0) {
            if (this.urls.length > 0) {
                body.urls = this.urls.join(',')
            }
            try {
                const resp = await this.callApi(request.post(`${this.config.host}/notify`)
                    .type('json')
                    .send(body));
                anyOk = true;
                this.logger.debug(`Pushed notification to URLs`);
            } catch (e: any) {
                this.logger.warn(`Failed to push notification for '${payload.title}' to URLs`, {cause: e});
            }
        }

        if (!anyOk) {
            this.logger.error(`Failed to push any notifications!`)
        }
    }

    callApi = async <T = unknown>(req: Request, retries = 0): Promise<T> => {
        try {
            return await req as T;
        } catch (e) {
            if (isNodeNetworkException(e) || isSuperAgentResponseError(e) && e.timeout) {
                throw new UpstreamError('Request failed to due a network issue', {cause: e});
            } else if (isSuperAgentResponseError(e)) {
                const {
                    message,
                    status,
                    response: {
                        body: jsonBody = undefined,
                        text = undefined,
                    } = {}
                } = e;
                const errorMsgs = [message];
                if (typeof jsonBody === 'object' && jsonBody.error !== undefined) {
                    errorMsgs.push(jsonBody.error);
                }
                throw new UpstreamError(`Apprise API Request failed => (${status}) ${errorMsgs.join(' => ')}`, {response: e.response});
            } else {
                throw new Error('Non API Request error encountered', {cause: e});
            }
        }
    }
}

const convertPriorityToType = (priority?: Priority): 'info' | 'success' | 'warning' | 'failure' => {
    switch (priority) {
        case 'info':
            return 'info';
        case 'warn':
            return 'warning';
        case 'error':
            return 'failure';
        default:
            return 'info';
    }
}
