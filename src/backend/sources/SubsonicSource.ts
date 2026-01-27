import * as crypto from 'crypto';
import dayjs from "dayjs";
import isSameOrAfter from "dayjs/plugin/isSameOrAfter.js";
import EventEmitter from "events";
import request, { Request } from 'superagent';
import { PlayObject, PlayObjectLifecycleless } from "../../core/Atomic.js";
import { isNodeNetworkException } from "../common/errors/NodeErrors.js";
import { UpstreamError } from "../common/errors/UpstreamError.js";
import { DEFAULT_RETRY_MULTIPLIER, FormatPlayObjectOptions, InternalConfig, PlayPlatformId } from "../common/infrastructure/Atomic.js";
import { SubSonicSourceConfig } from "../common/infrastructure/config/source/subsonic.js";
import { getSubsonicResponse, SubsonicResponse, SubsonicResponseCommon } from "../common/vendor/subsonic/interfaces.js";
import { parseRetryAfterSecsFromObj, removeDuplicates, sleep } from "../utils.js";
import { findCauseByFunc } from "../utils/ErrorUtils.js";
import { RecentlyPlayedOptions } from "./AbstractSource.js";
import MemorySource from "./MemorySource.js";
import { SubsonicPlayerState } from './PlayerState/SubsonicPlayerState.js';
import { PlayerStateOptions } from './PlayerState/AbstractPlayerState.js';
import { Logger } from '@foxxmd/logging';
import { baseFormatPlayObj } from '../utils/PlayTransformUtils.js';

dayjs.extend(isSameOrAfter);

interface SourceIdentifierData {
    /** Subsonic Version */
    version?: string,
    /** Media Player name */
    type?: string,
    /** Media Player version */
    serverVersion?: string,
    openSubsonic?: boolean
}

export class SubsonicSource extends MemorySource {

    requiresAuth = true;

    multiPlatform: boolean = true;

    declare config: SubSonicSourceConfig;

    usersAllow: string[] = [];

    sourceData: SourceIdentifierData = {};

    constructor(name: any, config: SubSonicSourceConfig, internal: InternalConfig, emitter: EventEmitter) {
        const {
            data: {
                ...restData
            } = {}
        } = config;
        const subsonicConfig = {...config, data: {...restData}};
        super('subsonic', name, subsonicConfig, internal,emitter);

        this.canPoll = true;
    }

    static formatPlayObj(obj: any, options: FormatPlayObjectOptions & { sourceData?: SourceIdentifierData } = {}): PlayObject {
        const {
            newFromSource = false,
            sourceData: {
                version,
                type,
                serverVersion,
                openSubsonic
            } = {},
        } = options;
        const {
            id,
            title,
            album,
            artist,
            duration, // seconds
            minutesAgo,
            playerId,
            username,
        } = obj;

        const play: PlayObjectLifecycleless = {
            data: {
                artists: [artist],
                album,
                track: title,
                duration,
                // subsonic doesn't return an exact datetime, only how many whole minutes ago it was played
                // so we need to force the time to be 0 seconds always so that when we compare against scrobbles from client the time isn't off
                playDate: minutesAgo === 0 ? dayjs().startOf('minute') : dayjs().startOf('minute').subtract(minutesAgo, 'minute'),
            },
            meta: {
                source: 'Subsonic',
                trackId: id,
                newFromSource,
                user: username,
                deviceId: playerId,
                mediaPlayerName: type ?? `${openSubsonic ? 'Open ' : ''}Subsonic`,
                mediaPlayerVersion: type !== undefined && serverVersion !== undefined ? serverVersion : version
            }
        }
        return baseFormatPlayObj(obj, play);
    }

    callApi = async <T extends SubsonicResponseCommon = SubsonicResponseCommon>(req: Request, retries = 0): Promise<T> => {
        const {
            data: {
                user,
                password
            } = {},
            options: {
                maxRequestRetries = 1,
                retryMultiplier = DEFAULT_RETRY_MULTIPLIER
            } = {},
        } = this.config;

        const queryOpts: Record<string, string> = {
            u: user,
            v: '1.15.0',
            c: `multi-scrobbler - ${this.name}`,
            f: 'json'
        };
        if((this.config?.data?.legacyAuthentication ?? false)) {
            //queryOpts.p = password;
            queryOpts.p = `enc:${Buffer.from(password).toString('hex')}`
        } else {
            const salt = crypto.randomBytes(10).toString('hex');
            const hash = crypto.createHash('md5').update(`${password}${salt}`).digest('hex')
            queryOpts.t = hash;
            queryOpts.s = salt;
        }

        req.query(queryOpts);

        if((this.config?.data?.ignoreTlsErrors ?? false)) {
            req.disableTLSCerts();
        }

        try {
            const resp = await req as SubsonicResponse;

            let errorTxt: string | undefined;

            const {
                body,
                status: httpStatus,
                text,
                headers: {
                    ['content-type']: ct = undefined,
                } = {}
            } = resp;

            if(ct === undefined || !ct.includes('json')) {
                errorTxt = `Subsonic Server response (${httpStatus}) was unexpected. Expected content-type to be json but found '${ct}`;
            } else if(Object.keys(body).length === 0) {
                errorTxt = `Subsonic Server response (${httpStatus}) was unexpected. Body is empty.`;
            }
            if(errorTxt !== undefined && text !== undefined) {
                errorTxt = `${errorTxt} | Text Response Sample: ${text.substring(0, 500)}`;
            }
            if(errorTxt !== undefined) {
                throw new UpstreamError(errorTxt, {showStopper: true});
            }

            const {
                "subsonic-response": {
                    status,
                },
                "subsonic-response": ssResp
            } = body;

            if (status === 'failed') {
                const uError = new UpstreamError(`Subsonic API returned an error => ${parseApiResponseErrorToThrowable(resp)}`, {response: resp});
                if(uError.message.includes('Subsonic Api Response => (41)')) {
                    const tokenError = 'This server does not support token-based authentication and must use the legacy authentication approach with sends your password in CLEAR TEXT.';
                    if(this.config.data.legacyAuthentication !== undefined) {
                        if(this.config.data.legacyAuthentication === true) {
                            this.logger.error(`${tokenError} MS has already tried to use legacy authentication but it has failed. There is likely a different reason the server is rejecting authentication.`);
                        } else {
                            this.logger.error(`${tokenError} Your config settings do not allow legacy authentication to be used.`);
                        }
                        throw uError;
                    } else {
                        this.logger.warn(`${parseApiResponseErrorToThrowable(resp)} | ${tokenError} MS will attempt to use legacy authentication since 'legacyAuthentication' is not explicitly defined (or disabled) in config.`);
                        this.config.data.legacyAuthentication = true;
                        return await this.callApi(req);
                    }
                }
            }

            // @ts-expect-error it is assignable to T idk
            return ssResp;
        } catch (e) {
            if(e instanceof UpstreamError) {
                throw e;
            }

            if((isNodeNetworkException(e) || e.status >= 500) && retries < maxRequestRetries) {
                const retryAfter = parseRetryAfterSecsFromObj(e) ?? (retryMultiplier * (retries + 1));
                this.logger.warn(`Request failed but retries (${retries}) less than max (${maxRequestRetries}), retrying request after ${retryAfter} seconds...`);
                await sleep(retryAfter * 1000);
                return await this.callApi(req, retries + 1)
            }

            if(isNodeNetworkException(e)) {
                throw new UpstreamError('Could not communicate with Subsonic Server', {cause: e, showStopper: true});
            }

            if(e.message.includes('self-signed certificate')) {
                throw new UpstreamError(`Subsonic server uses self-signed certs which MS does not allow by default. This error can be ignored by setting 'ignoreTlsErrors: true' in config. WARNING this can result in cleartext communication which is insecure.`, {cause: e, showStopper: true});
            }

            throw new UpstreamError('Subsonic server response was unexpected', {cause: e});
        }
    }

    protected async doBuildInitData(): Promise<true | string | undefined> {
        const {data: {user, password, url} = {}} = this.config;

        if (user === undefined) {
            throw new Error(`Cannot setup Subsonic source, 'user' is not defined`);
        }
        if (password === undefined) {
            throw new Error(`Cannot setup Subsonic source, 'password' is not defined`);
        }
        if (url === undefined) {
            throw new Error(`Cannot setup Subsonic source, 'url' is not defined`);
        }

        let usersAllowVal = this.config.data.usersAllow;
        if(usersAllowVal !== undefined && usersAllowVal !== null) {
            if(!Array.isArray(usersAllowVal)) {
                usersAllowVal = [usersAllowVal];
            }
            if(usersAllowVal.filter(x => x.toString().trim() !== '').length > 0) {
                this.usersAllow = usersAllowVal.map(x => x.toString().trim());
            }
        }

        if(this.usersAllow.length === 0) {
            this.logger.verbose('Will monitor plays by all users');
        } else {
            this.logger.verbose(`Will only monitor plays for the following users: ${this.usersAllow.join(', ')}`);
        }

        return true;
    }

    protected async doCheckConnection(): Promise<true | string | undefined> {
        const {url} = this.config.data;
        try {
            const resp = await this.callApi(request.get(`${url}/rest/ping`));
            this.sourceData = resp as SourceIdentifierData;
            this.logger.info(`Subsonic Server reachable: ${identifiersFromResponse(resp)}`);
            return true;
        } catch (e) {

            const subResponseError = getSubsonicResponseFromError(e);
            if(subResponseError !== undefined) {
                const resp = getSubsonicResponse(subResponseError.response)
                this.logger.info(`Subsonic Server reachable: ${identifiersFromResponse(resp)}`);
                this.sourceData = resp as SourceIdentifierData;
                return true;
            }

            if(e instanceof UpstreamError) {
                throw e;
            } else if(isNodeNetworkException(e)) {
                throw new UpstreamError('Could not communicate with Subsonic server', {cause: e});
            } else if(e.status >= 500) {
                throw new UpstreamError('Subsonic server returning an unexpected response', {cause: e})
            } else {
                throw new Error('Unexpected error occurred', {cause: e})
            }
        }
    }

    doAuthentication = async () => {
        const {url} = this.config.data;
        try {
            await this.callApi(request.get(`${url}/rest/ping`));
            this.logger.info('Subsonic API Status: ok');
            return true;
        } catch (e) {
            throw e;
        }
    }

    getRecentlyPlayed = async (options: RecentlyPlayedOptions = {}) => {
        const {formatted = false} = options;
        const {url} = this.config.data;
        const resp = await this.callApi(request.get(`${url}/rest/getNowPlaying`));
        const {
            nowPlaying: {
                entry = []
            } = {}
        } = resp;
        // sometimes subsonic sources will return the same track as being played twice on the same player, need to remove this so we don't duplicate plays
        const deduped = removeDuplicates(entry.map(x => SubsonicSource.formatPlayObj(x, {sourceData: this.sourceData})));
        const userFiltered = this.usersAllow.length == 0 ? deduped : deduped.filter(x => x.meta.user === undefined || this.usersAllow.map(x => x.toLocaleLowerCase()).includes(x.meta.user.toLocaleLowerCase()));
        return await this.processRecentPlays(userFiltered);
    }

    getNewPlayer = (logger: Logger, id: PlayPlatformId, opts: PlayerStateOptions) => new SubsonicPlayerState(logger, id, opts);
}

export const getSubsonicResponseFromError = (error: unknown): UpstreamError => findCauseByFunc(error, (err) => {
        if(err instanceof UpstreamError && err.response !== undefined) {
            return getSubsonicResponse(err.response) !== undefined;
        }
        return false;
    }) as UpstreamError | undefined

export const parseApiResponseErrorToThrowable = (resp: SubsonicResponse) => {
    const {
        status,
        text,
        body: {
            "subsonic-response": {
                status: ssStatus,
                version,
                type,
                serverVersion,
                error: {
                    code,
                    message: ssMessage,
                } = {},
            } = {},
            "subsonic-response": ssResp = {}
        } = {},
        body = {},
    } = resp;
    if(Object.keys(ssResp).length > 0) {
        return `(${identifiersFromResponse(body['subsonic-response'])}) Subsonic Api Response => (${code}) ${ssStatus}: ${ssMessage}`;
    }
    if(Object.keys(body).length > 0) {
        return `Subsonic Server Response => (${status}) ${JSON.stringify(body)}`;
    }
    if(text !== undefined && text.trim() !== '') {
        return `Subsonic Server Response => (${status}) ${text.substring(0, 100)}`;
    }
    return `Subsonic Server HTTP Response ${status} (no response content)`;
}

export const identifiersFromResponse = (data: SubsonicResponseCommon) => {
    const {
        version,
        type,
        serverVersion,
    } = data;
    const identifiers = [];
    if(type !== undefined) {
        identifiers.push(type);
    }
    if(version !== undefined) {
        identifiers.push(`v${version}`);
    }
    if(serverVersion !== undefined) {
        identifiers.push(`server v${serverVersion}`);
    }
    if(identifiers.length === 0) {
        return 'No Server Identifiers';
    }
    return identifiers.join(' | ');
}
