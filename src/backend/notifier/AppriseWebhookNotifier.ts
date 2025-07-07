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
import { URLData } from "../../core/Atomic.js";
import { isPortReachable, joinedUrl, normalizeWebAddress } from "../utils/NetworkUtils.js";
import { isDebugMode } from "../utils.js";

const shortKey = truncateStringToLength(10);

export class AppriseWebhookNotifier extends AbstractWebhookNotifier {

    declare config: AppriseConfig;

    priorities: PrioritiesConfig;

    protected endpoint: URLData;

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
        // check url is correct as a courtesy
        this.endpoint = normalizeWebAddress(this.config.host);
        this.logger.verbose(`Config URL: '${this.config.host}' => Normalized: '${this.endpoint.normal}'`)

        this.initialized = true; // always set as ready to go. Server issues may be transient.

        try {
            await isPortReachable(this.endpoint.port, { host: this.endpoint.url.hostname });
        } catch (e) {
            this.logger.warn(new Error('Unable to detect if server is reachable', { cause: e }));
            return;
        }

        if (this.keys.length > 0) {
            let anyOk = false;
            for (const key of this.keys) {
                try {
                    const resp = await request.get(joinedUrl(this.endpoint.url, `/json/urls/${key}`).toString());
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
                this.logger.warn('No Apprise Configs were valid!');
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
                    const resp = await this.callApi(request.post(joinedUrl(this.endpoint.url, `/notify/${key}`).toString())
                        .type('json')
                        .send(body));
                    anyOk = true;
                    this.logger.verbose(`Pushed notification to Config ${shortKey(key)}`);
                } catch (e: any) {
                    this.logger.warn(new Error(`Failed to push notification for '${payload.title}' to Config ${shortKey(key)}`, {cause: e}));
                    if(isDebugMode()) {
                        this.logger.debug({ body }, 'Apprise Request')
                    }
                }
            }
        }

        if (this.urls.length > 0 || this.keys.length === 0) {
            if (this.urls.length > 0) {
                body.urls = this.urls.join(',')
            }
            try {
                const resp = await this.callApi(request.post(joinedUrl(this.endpoint.url, '/notify').toString())
                    .type('json')
                    .send(body));
                anyOk = true;
                this.logger.verbose(`Pushed notification to URLs`);
            } catch (e: any) {
                this.logger.warn(`Failed to push notification for '${payload.title}' to URLs`, {cause: e});
                if(isDebugMode()) {
                    this.logger.debug({ body }, 'Apprise Request')
                }
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
                if(typeof jsonBody === 'object') {
                    let appriseError = 'Apprise Error Response';
                    if ('error' in jsonBody) {
                        appriseError = `${appriseError}: ${jsonBody.error}`;
                    }
                    if('details' in jsonBody) {
                        const appriseDetails = [];
                        if(Array.isArray(jsonBody.details)) {
                            for(const detailEntry of jsonBody.details) {
                                try {
                                appriseDetails.push(`(${detailEntry[0]}) ${detailEntry[2]}`);
                                } catch (e) {
                                    appriseDetails.push(JSON.stringify(detailEntry));
                                }
                            }
                        } else {
                            appriseDetails.push(JSON.stringify(jsonBody.details));
                        }
                        appriseError = `${appriseError} --> ${appriseDetails.join(' || ')} <--`;
                    }
                    errorMsgs.push(appriseError);
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
