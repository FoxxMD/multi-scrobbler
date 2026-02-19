import { childLogger } from "@foxxmd/logging";
import { WS } from 'iso-websocket'
import { DiscordClientData, DiscordData, DiscordStrongData, StatusType, ActivityType as MSActivityType, ActivityTypes } from "../../infrastructure/config/client/discord.js";
import { _DataPayload, _NonDispatchPayload, ActivityType, APIUser, GatewayActivity, GatewayActivityButton, GatewayActivityUpdateData, GatewayCloseCodes, GatewayDispatchEvents, GatewayHeartbeatRequest, GatewayHelloData, GatewayIdentify, GatewayIdentifyData, GatewayInvalidSessionData, GatewayOpcodes, GatewayPresenceUpdateData, GatewayReadyDispatchData, GatewayResumeData, GatewayUpdatePresence, PresenceUpdateStatus } from "discord.js";
import { isDebugMode, parseBool, removeUndefinedKeys, sleep } from "../../../utils.js";
import pEvent from 'p-event';
import EventEmitter from "events";
import { randomInt } from "crypto";
import request from 'superagent';
import AbstractApiClient from "../AbstractApiClient.js";
import { AbstractApiOptions, asPlayerStateData, SourceData } from "../../infrastructure/Atomic.js";
import { isPlayObject, PlayObject } from "../../../../core/Atomic.js";
import dayjs from "dayjs";
import { capitalize } from "../../../../core/StringUtils.js";
import { parseArrayFromMaybeString, parseBoolOrArrayFromMaybeString } from "../../../utils/StringUtils.js";
import { getRoot } from "../../../ioc.js";
import { MSCache } from "../../Cache.js";
import { isSuperAgentResponseError } from "../../errors/ErrorUtils.js";
import { urlToMusicService } from "../ListenbrainzApiClient.js";
import { urlContainsKnownMediaDomain } from "../../../utils/RequestUtils.js";
import { CoverArtApiClient } from "../musicbrainz/CoverArtApiClient.js";
import { formatWebsocketClose, isCloseEvent, isErrorEvent } from "../../../utils/NetworkUtils.js";

const ARTWORK_PLACEHOLDER = 'https://raw.githubusercontent.com/FoxxMD/multi-scrobbler/master/assets/default-artwork.png';
const MS_ART = 'https://raw.githubusercontent.com/FoxxMD/multi-scrobbler/master/assets/icon.png';
const API_GATEWAY_ENDPOINT = 'https://discord.com/api/gateway';

/**
 * Implementation largely based on
 * 
 * https://github.com/n0thhhing/Discord-rich-presence
 * https://github.com/logixism/navicord
 * 
 * Existing implementations of Rich Presence all use the local RPC gateway from a running Discord app
 * and the impl that actually uses the remote gateway, @discord/ws, is only built for bot use
 * so we need to roll our own Gateway API interface https://docs.discord.com/developers/events/gateway
 * 
 */
export class DiscordWSClient extends AbstractApiClient {

    declare config: DiscordStrongData;

    heartbeatInterval: NodeJS.Timeout
    acknowledged: boolean = true;

    // https://docs.discord.com/developers/events/gateway#ready-event
    // used for resuming session, if possible
    session_id: string;
    resume_gateway_url: string;
    sequence: number;

    initialGatewayUrl?: string;

    user: APIUser;

    declare client: WS;

    canResume?: boolean = false;
    ready: boolean = false;
    authOK?: boolean
    reconnecting?: boolean = false;

    lastActiveStatus?: PresenceUpdateStatus = PresenceUpdateStatus.Offline;
    lastActivities: GatewayActivity[] = [];

    activityTimeout: NodeJS.Timeout;

    emitter: EventEmitter;

    cache: MSCache;
    covertArtApi: CoverArtApiClient;
    artFail: boolean = false;
    artFailCount = 0;

    constructor(name: any, config: DiscordStrongData, options: AbstractApiOptions) {
        super('Discord', name, config, options);
        this.logger = childLogger(options.logger, 'WS Gateway');
        this.emitter = new EventEmitter();
        this.cache = getRoot().items.cache();
        this.covertArtApi = getRoot().items.coverArtApi;
    }

    initClient = async () => {
        // let baseUrl: string;
        // if (this.resume_gateway_url !== undefined) {
        //     baseUrl = this.resume_gateway_url;
        // } else {
        //     if (this.initialGatewayUrl === undefined) {
        //         try {
        //             await this.fetchGatewayUrl();
        //             baseUrl = this.initialGatewayUrl;
        //         } catch (e) {
        //             throw new Error('Could not get initial gateway url', { cause: e });
        //         }
        //     } else {
        //         baseUrl = this.initialGatewayUrl;
        //     }
        // }

        // const gatewayUrl = `${baseUrl}?encoding=json&v=10`;
        // this.logger.debug(`Using Gateway URL ${gatewayUrl}`);

        const url = () => {
            let baseUrl: string;
            if (this.resume_gateway_url !== undefined) {
                baseUrl = this.resume_gateway_url;
            } else {
                baseUrl = this.initialGatewayUrl;
            }
            const gatewayUrl = `${baseUrl}?encoding=json&v=10`;
            this.logger.debug(`Using Gateway URL ${gatewayUrl}`);
            return gatewayUrl;
        }

        this.client = new WS(url, {
            automaticOpen: false,
            debug: true,
            retry: {
                retries: 3
            },
            shouldRetry: (e) => {
                if(isCloseEvent(e)) {
                    const err = e as CloseEvent;
                    const closeHint = formatWebsocketClose(err);
                    this.logger.warn(`Connection was closed: ${closeHint}`);

                    let discordImmediateStop = false;

                    if ([
                        GatewayCloseCodes.AuthenticationFailed,
                        GatewayCloseCodes.InvalidShard,
                        GatewayCloseCodes.ShardingRequired,
                        GatewayCloseCodes.InvalidAPIVersion,
                        GatewayCloseCodes.InvalidIntents,
                        GatewayCloseCodes.DisallowedIntents
                    ].includes(e.code)) {
                        this.canResume = false;
                    }
                    // don't attempt to reconnect, will always fail
                    if (GatewayCloseCodes.AuthenticationFailed === e.code) {
                        this.authOK = false;
                        discordImmediateStop = true;
                    }
                    this.cleanupConnectionSync();

                    const shouldRetry = !discordImmediateStop && e.code !== 1008 && e.code !== 1011;
                    this.logger.debug(`Should Retry? ${shouldRetry}`);
                    return shouldRetry;
                } else if(isErrorEvent(e)) {
                    if(e.message === 'Connection timeout') {
                        if(this.authOK === false) {
                            // discord immediately told us that auth was not good and we closed the connection
                            //
                            // iso-websockets initial connect assumes if connection is closed after 5 seconds it was a timeout
                            // when in reality we closed it before the timeout check occurred
                            // https://github.com/hugomrdias/iso-repo/issues/466
                            return false; 
                        }
                        this.logger.warn(`Connection was closed due to timeout, will retry`);
                        return true;
                    }
                    this.logger.debug('Will not retry');
                    return false;
                }
                this.logger.debug('Will not retry');
                return false;
            }
        });

        this.client.addEventListener('retry', (e) => {
            this.logger.verbose(`Retrying connection, attempt ${e.attempt}`);
            this.reconnecting = true;
        });

        this.client.addEventListener('close', async (e) => {
            this.logger.debug('onClose event');
            if (isCloseEvent(e)) {
                if (GatewayCloseCodes.AuthenticationFailed === e.code) {
                    // don't attempt to reconnect, will always fail
                    //this.cleanupConnectionSync();
                    this.authOK = false;
                    this.reconnecting = false;
                    this.emitter.emit('stopped', { authFailure: true });
                } else if (e.code === 1008 || e.code === 1011) {
                    //this.cleanupConnectionSync();
                    this.emitter.emit('stopped', { authFailure: false });
                    this.reconnecting = false;
                }
            } else {
                this.logger.error(new Error('Connection closed and retry did not occur due to unexpected error', { cause: e }));
                this.cleanupConnectionSync();
                this.emitter.emit('stopped', { authFailure: false });
            }
        });
        this.client.addEventListener('open', (e) => {
            this.logger.verbose(`Connection was established.`);
            if(this.reconnecting) {
                this.authenticate();
            }
        });

        this.client.addEventListener('error', (e) => {
            this.logger.error(new Error(`Error from Discord Gateway`, { cause: e.error }));
            this.canResume = false;
            this.reconnecting = false;
            this.cleanupConnectionSync();
            this.emitter.emit('stopped', { authFailure: false });
        });

        this.client.addEventListener('message', async (e) => {
            try {
                await this.handleMessage(JSON.parse(e.data));
            } catch (e) {
                this.logger.error(e);
            }
        });
    }

    protected authenticate = () => {
        if (this.canResume && this.session_id !== undefined) {
            // using resume
            this.handleResume();
        } else {
            // initial identify
            this.handleIdentify();
        }
    }

    tryAuthenticate = async () => {
        if (this.ready) {
            return;
        }
        if(this.client.readyState !== this.client.OPEN) {
            try {
                await this.tryConnect();
            } catch (e) {
                throw e;
            }
        }
        try {
            this.authenticate();
            const result = await Promise.race([
                pEvent(this.emitter, 'ready'),
                pEvent(this.emitter, 'stopped'),
                sleep(6000),
            ]);
            if (result === undefined) {
                throw new Error('Timeout waiting for Discord WS to open');
            } else if ('authFailure' in result) {
                if (result.authFailure) {
                    throw new Error('Could not authenticate with Discord WS');
                } else {
                    throw new Error('Could not establish a valid connection with Discord WS');
                }
            }
            return true;
        } catch (e) {
            throw e;
        }
    }

    fetchGatewayUrl = async () => {
        const resp = await request.get(API_GATEWAY_ENDPOINT);
        this.initialGatewayUrl = resp.body.url;
        this.logger.debug(`Got Initial Gateway Base: ${this.initialGatewayUrl}`);
    }

    tryConnect = async () => {
        try {
            if(this.client.readyState === this.client.OPEN) {
                return true;
            }
            if(this.client.readyState === this.client.CLOSING) {
                throw new Error('Client is trying to close, cannot try to connect right now');
            }
            this.client.open();
            const result = await Promise.race([
                pEvent(this.client, 'open'),
                pEvent(this.emitter, 'stopped'),
                pEvent(this.emitter, 'error'),
                sleep(6000),
            ]);
            if (result === undefined) {
                throw new Error('Timeout waiting for Discord WS to open');
            } else if (isErrorEvent(result)) {
                throw new Error('Could not establish a connection with Discord WS', { cause: result.error });
            } else if (result instanceof Error) {
                throw new Error('Could not establish a connection with Discord WS', { cause: result });
            } else if ('authFailure' in result) {
                throw new Error('Could not establish a connection with Discord WS');
            }
            return true;
        } catch (e) {
            throw e;
        }
    }

    handleIdentify() {
        const data: GatewayIdentify = {
            op: GatewayOpcodes.Identify,
            d: {
                token: this.config.token,
                intents: 0,
                properties: {
                    os: "linux",
                    device: "Discord Client",
                    browser: "Discord Client"
                }
            }
        };
        if(this.client.OPEN !== this.client.readyState) {
            this.logger.warn(`Cannot send Identify because connection is not open`);
            return;
        } else if(isDebugMode()) {
            this.logger.debug('Sending identify');
        }
        this.client.send(JSON.stringify(data));
    }

    async handleHello(data: GatewayHelloData) {
        // jitter
        // https://docs.discord.com/developers/events/gateway#heartbeat-interval
        const sleepTime = randomInt(data.heartbeat_interval - 1);
        this.logger.debug(`Heartbeat Interval: ${data.heartbeat_interval}ms (${Math.floor(data.heartbeat_interval / 1000)}s), waiting ${Math.floor(sleepTime / 1000)}s before sending first heartbeat.`);
        await sleep(sleepTime);
        if (this.client.readyState !== this.client.OPEN) {
            this.logger.warn(`Not continuing with heartbeat because connection is not open`);
            return;
        }
        this.sendHeartbeat();
        this.heartbeatInterval = setInterval(() => {
            if (this.client.OPEN !== this.client.readyState) {
                if (this.heartbeatInterval !== undefined) {
                    clearInterval(this.heartbeatInterval);
                }
                return;
            }
            if (!this.acknowledged) {
                // zombied!
                return this.handleReconnect().then(() => null).catch((e) => this.logger.error(e));
            }
            this.sendHeartbeat();
        }, data.heartbeat_interval);
    }

    sendHeartbeat() {

        const heartbeatRequest: GatewayHeartbeatRequest = {
            op: GatewayOpcodes.Heartbeat,
            // @ts-expect-error
            d: this.sequence ?? null
        }
        this.acknowledged = false;
        if (this.client.readyState !== this.client.OPEN) {
            this.logger.warn(`Cannot send heartbeat because connection is not open`);
            return;
        } else if(isDebugMode()) {
            this.logger.debug('Sending heartbeat');
        }
        this.client.send(JSON.stringify(heartbeatRequest));
    }

    /** 
     * https://docs.discord.com/developers/events/gateway#identifying
     * https://docs.discord.com/developers/events/gateway#ready-event
     * https://docs.discord.com/developers/events/gateway-events#ready  */
    handleReady(data: GatewayReadyDispatchData) {
        this.session_id = data.session_id;
        this.resume_gateway_url = data.resume_gateway_url;
        this.user = data.user;
        this.canResume = true;
        this.ready = true;
        this.authOK = true;
        this.reconnecting = false;
        this.logger.verbose(`Gateway Connection READY for ${this.user.username}`);
        this.emitter.emit('ready', {ready: true});
    }

    /** https://docs.discord.com/developers/events/gateway-events#invalid-session */
    handleInvalidSession(data: GatewayInvalidSessionData) {
        this.canResume = data !== false;
        return this.handleReconnect().then(() => null).catch((e) => this.logger.error(e));
    }

    async handleReconnect() {

        // on a manual close ws-isosocket does not retry
        // so we need to do it manually
        this.client.close();
        const result = await Promise.race([
            pEvent(this.client, 'close'),
            sleep(3000),
        ]);
        if(result === undefined) {
            throw new Error('Waited too long for client to close');
        }
        try {
            await this.tryAuthenticate();
        } catch (e) {
            throw new Error('Could not manually reconnect', {cause: e});
        }
        //await this.cleanupConnection();
        //  maybe don't do this if we've failed N times
        //this.initClient();
        //this.connect();
    }

    handleResume() {
        const data: GatewayResumeData = {
            token: this.config.token,
            session_id: this.session_id,
            seq: this.sequence
        }

        if(this.client.OPEN !== this.client.readyState) {
            this.logger.warn(`Cannot send resume because connection is not open`);
            return;
        } else if(isDebugMode()) {
            this.logger.debug('Sending resume');
        }
        this.client.send(JSON.stringify({ op: GatewayOpcodes.Resume, d: data }));
    }

    async cleanupConnection() {
        clearInterval(this.heartbeatInterval);
        this.heartbeatInterval = undefined;
        clearTimeout(this.activityTimeout);
        this.activityTimeout = undefined;

        if (this.client.CLOSED !== this.client.readyState) {
            this.client.close();
            // wait for close or just give it a few seconds
            const result = await Promise.race([
                pEvent(this.client, 'close'),
                sleep(3000),
            ]);
        } else if(this.client.CLOSING === this.client.readyState) {
            this.logger.debug('Giving the client time to close...');
            await sleep(3000);
        }
        this.ready = false;
        if (!this.canResume) {
            this.logger.debug('Cannot resume session, clearing session data for clean reconnect');
            this.session_id = undefined;
            this.sequence = undefined;
            this.resume_gateway_url = undefined;
            this.user = undefined;
            this.lastActiveStatus = PresenceUpdateStatus.Offline;
            this.lastActivities = [];
        }
    }

    cleanupConnectionSync() {
        if(this.heartbeatInterval !== undefined) {
            clearInterval(this.heartbeatInterval);
            this.heartbeatInterval = undefined;
        }
        if(this.activityTimeout !== undefined) {
            clearTimeout(this.activityTimeout);
            this.activityTimeout = undefined;
        }
        this.ready = false;
        if (!this.canResume) {
            this.logger.debug('Cannot resume session, clearing session data for clean reconnect');
            this.session_id = undefined;
            this.sequence = undefined;
            this.resume_gateway_url = undefined;
            this.user = undefined;
            this.lastActiveStatus = PresenceUpdateStatus.Offline;
            this.lastActivities = [];
        }
    }

    handleUserSessionUpdates = (data: UserSession[]) => {
        this.logger.debug('Recieved updated user sessions');
        if (data.filter(x => x.session_id !== this.session_id && x.session_id !== 'all').length === 0) {
            this.logger.debug('No other user sessions exist, marking our session presence as inactive');
            this.lastActiveStatus = PresenceUpdateStatus.Offline;
            this.lastActivities = [];
            return;
        }
        const otherSessions = data.filter(x => x.session_id !== this.session_id);
        const sessionSummaries = otherSessions.map(x => {
            let sessionId = `${x.session_id === 'all' ? '(All) | ' : ''}OS ${x.client_info.os} | Client ${x.client_info.client} | Status ${x.status} | Active ${x.active === true}`;
            if(x.activities.length === 0) {
                sessionId += " | 0 Activities"
            } else {
                const activitySummary = x.activities.map(x => x.type === 4 ? 'Custom Status' : `${activityIdToStr(x.type)} ${x.name}`).join(', ');
                sessionId += ` | Activities => ${activitySummary}`;
            };
            return sessionId;
        });
        this.logger.debug(sessionSummaries.join('\n'));

        const last = this.lastActiveStatus;

        if (otherSessions.some(x => x.status === 'online')) {
            this.lastActiveStatus = PresenceUpdateStatus.Online;
        } else if (otherSessions.some(x => x.status === 'dnd')) {
            this.lastActiveStatus = PresenceUpdateStatus.DoNotDisturb;
        } else if (otherSessions.some(x => x.status === 'idle')) {
            this.lastActiveStatus = PresenceUpdateStatus.Idle;
        } else if (otherSessions.some(x => x.status === 'invisible')) {
            this.lastActiveStatus = PresenceUpdateStatus.Invisible;
        } else {
            this.lastActiveStatus = PresenceUpdateStatus.Offline;
        }
        this.logger.debug(`Best status found: ${this.lastActiveStatus}`);

        this.lastActivities = otherSessions.filter(x => x.session_id !== 'all').map(x => x.activities).flat(1);

        const [allowed, reason] = this.presenceIsAllowed();
        if(!allowed) {
            // if updated sessions now disallow updating presence
            // and we have a current presence in our session
            // then we need to remove it so it doesn't override anything
            const ourSession = data.find(x => x.session_id === this.session_id);
            if(ourSession !== undefined && ourSession.activities.length > 0) {
                this.logger.debug(`Clearing our session presence, MS presence no longer allowed because ${reason}`);
                this.clearActivity();
            }
        }
    }

    async handleMessage(message: _DataPayload<GatewayDispatchEvents> | _NonDispatchPayload) {
        try {
            const { op, s } = message;
            if (s !== null && s !== undefined) {
                this.sequence = s;
            }
            if (isDebugMode()) {
                const friendlyOp = opcodeToFriendly(op);
                let handleHint = `Got opcode ${op}${friendlyOp !== op ? ` (${friendlyOp})` : ''}`;
                if (op === GatewayOpcodes.Dispatch) {
                    handleHint += ` w/ Dispatch Event ${message.t}`;
                }
                this.logger.debug(handleHint);
            }

            switch (op) {
                case GatewayOpcodes.Hello:
                    this.handleHello(message.d as GatewayHelloData).catch(e => this.logger.error(e));
                    break;
                case GatewayOpcodes.HeartbeatAck:
                    if (isDebugMode()) {
                        this.logger.debug("Heartbeat acknowledged");
                    }
                    this.acknowledged = true;
                    break;
                case GatewayOpcodes.Heartbeat:
                    if (isDebugMode()) {
                        this.logger.debug("Received Heartbeat");
                    }
                    this.sendHeartbeat();
                    break;
                case GatewayOpcodes.Dispatch:
                    const { t } = message;
                    switch (t) {
                        case GatewayDispatchEvents.Ready:
                            this.handleReady(message.d as GatewayReadyDispatchData);
                            break;
                        // @ts-expect-error
                        case 'SESSIONS_REPLACE':
                            if (isDebugMode()) {
                                // @ts-expect-error
                                this.logger.debug(`${t}   => ${JSON.stringify(message.d)}`);
                            }
                            // @ts-expect-error
                            this.handleUserSessionUpdates(message.d as UserSession[]);
                            break;
                    };
                    break;
                case GatewayOpcodes.InvalidSession:
                    this.logger.debug('Recieved invalid session opcode');
                    this.handleInvalidSession(message.d as GatewayInvalidSessionData);
                    break;
                case GatewayOpcodes.Reconnect:
                    this.logger.debug('Recieved reconnect opcode');
                    await this.handleReconnect();
                    break;
                case GatewayOpcodes.Resume:
                    this.logger.debug({ data: message.d }, 'Recieved Resumed session');
                    this.canResume = true;
                    this.ready = true;
                    this.authOK = true;
                    this.reconnecting = false;
                    this.emitter.emit('ready', {ready: true});
                    break;
                case GatewayOpcodes.Identify:
                    this.logger.debug({ data: message.d }, 'Recieved Identifiy opcode');
                    break;
                case GatewayOpcodes.PresenceUpdate:
                    this.logger.debug({ data: message.d }, 'Recieved Presence Update opcode');
                    break;
                default:
                    this.logger.debug(`Recieved unhandled opcode: ${op}`);
                    break;
            }
        } catch (error) {
            throw new Error('Error handling gateway message', { cause: error });
        }
    }

    playStateToActivity = async (data: SourceData): Promise<GatewayActivity> => {
        const { activity, artUrl } = playStateToActivityData(data);
        const {
            artwork = false
        } = this.config;
        const {
            artworkDefaultUrl = ARTWORK_PLACEHOLDER,
            applicationId
        } = this.config;

        if(applicationId !== undefined) {

            let art = artworkDefaultUrl;
            if(artUrl !== undefined) {
                if(urlContainsKnownMediaDomain(artUrl)) {
                    art = artUrl;
                } else if (artwork !== false) {
                    if (Array.isArray(artwork)) {
                        const allowed = artwork.some(x => artUrl.toLocaleLowerCase().includes(x.toLocaleLowerCase()));
                        if (allowed) {
                            art = artUrl;
                        }
                    } else {
                        const u = new URL(artUrl);
                        // only allow secure protocol as this is likely to be a real domain that is public accessible
                        // IP domain usually uses http only
                        if (u.protocol === 'https://') {
                            art = artUrl;
                        }
                    }
                }
            }

            if(art === artworkDefaultUrl) {
                const play = isPlayObject(data) ? data : data.play;
                if(play.data.meta?.brainz?.album !== undefined) {
                    const albumArt = await this.covertArtApi.getCoverThumb(play.data.meta?.brainz?.album, {size: 250});
                    if(albumArt !== undefined) {
                        art = albumArt;
                    }
                }
            }

            // https://docs.discord.com/developers/events/gateway-events#activity-object-activity-assets
            // https://docs.discord.com/developers/events/gateway-events#activity-object-activity-asset-image
            const usedUrl = await this.getArtworkUrl(art);
            if(usedUrl !== undefined) {
                activity.assets.large_image = usedUrl;
            }
            if(art !== MS_ART) {
                const smallArt = await this.getArtworkUrl(MS_ART);
                if(smallArt !== undefined) {
                        activity.assets.small_image = smallArt;
                        activity.assets.small_text = 'Via Multi-Scrobbler'
                        activity.assets.small_url = 'https://multi-scrobbler.app'
                } 
            }
        }

        return activity;
    }

    sendActivity = async (data: SourceData | undefined) => {
        if(data === undefined) {
            this.clearActivity();
            return;
        }
        const [sendOk, reasons] = this.checkOkToSend();
        if (!sendOk) {
            this.logger.warn(`Cannot send activity because client is ${reasons}`);
            return;
        } else if(isDebugMode()) {
            this.logger.debug('Sending activity');
        }

        const activity = await this.playStateToActivity(data);

        const play = isPlayObject(data) ? data : data.play;

        let clearTime = dayjs().add(260, 'seconds'); // funny number
        if (activity.timestamps?.end !== undefined) {
            clearTime = dayjs.unix(Math.floor(activity.timestamps.end as number / 1000));
        } else if (play.data?.duration !== undefined) {
            clearTime = dayjs().add(play.data.duration, 'seconds')
        }

        const updateData = this.generatePresenceUpdate();
        updateData.activities.push(activity);

        const currentActivity: GatewayUpdatePresence = {
            op: GatewayOpcodes.PresenceUpdate,
            d: updateData
        }

        this.client.send(JSON.stringify(currentActivity));

        if (this.activityTimeout !== undefined) {
            clearTimeout(this.activityTimeout);
        }
        this.activityTimeout = setTimeout(() => {
            this.clearActivity();
        }, Math.abs(clearTime.diff(dayjs(), 'ms')));
    }

    clearActivity = () => {
        if (this.activityTimeout !== undefined) {
            clearTimeout(this.activityTimeout);
            this.activityTimeout = undefined;
        }

        const [sendOk, reasons] = this.checkOkToSend();
        if (!sendOk) {
            this.logger.warn(`Cannot clear activity because client is ${reasons}`);
            return;
        } else if(isDebugMode()) {
            this.logger.debug('Sending clear activity');
        }

        const clearedActivity: GatewayUpdatePresence = {
            op: GatewayOpcodes.PresenceUpdate,
            d: this.generatePresenceUpdate()
        }
        this.client.send(JSON.stringify(clearedActivity));

    }

    generatePresenceUpdate = (): GatewayPresenceUpdateData => {
        return {
            since: null,
            activities: [],
            status: this.lastActiveStatus,
            // TODO determine this?
            afk: this.lastActiveStatus === PresenceUpdateStatus.Idle
        }
    }

    checkOkToSend = (): [boolean, string?] => {
        if (this.ready && this.client.OPEN === this.client.readyState) {
            return [true];
        }
        const reasons = [];
        if (!this.ready) {
            reasons.push('not ready');
        }
        if (this.client.OPEN !== this.client.readyState) {
            reasons.push(`socket not open (${this.client.readyState})`);
        }
        return [false, reasons.join(' and ')];
    }

    getArtworkUrl = async (artUrl: string): Promise<string | undefined> => {

        const cachedUrl = await this.cache.cacheMetadata.get<string>(artUrl);
        if (cachedUrl !== undefined) {
            return cachedUrl;
        }

        if (this.config.applicationId === undefined || this.artFail) {
            return;
        }

        try {
            const imgResp = await request.post(`https://discord.com/api/v10/applications/${this.config.applicationId}/external-assets`)
                .set('Authorization', this.config.token)
                .type('json')
                .send({ "urls": [artUrl] });
            this.artFailCount = 0;
            const proxied = `mp:${imgResp.body[0].external_asset_path}`
            await this.cache.cacheMetadata.set(artUrl, proxied);
            return proxied;
        } catch (e) {
            this.artFailCount++;
            this.logger.warn(new Error('Failed to upload art url', { cause: e }));
            if (isSuperAgentResponseError(e)) {
                if (e.status === 401 || e.status === 403) {
                    this.artFail = true;
                }
            } else if (this.artFailCount > 3) {
                this.logger.verbose('More than 3 consecutive failures to upload art...turning off to stop spamming bad requests');
                this.artFail = true;
            }
            return;
        }
    }

    presenceIsAllowedByStatus = (status?: PresenceUpdateStatus | StatusType): [boolean, string?] => {
        if (!this.config.statusOverrideAllow.includes(status as StatusType ?? this.lastActiveStatus as StatusType)) {
            return [false, `most active session has a disallowed status: ${status ?? this.lastActiveStatus}`];
        }
        return [true];
    }

    presenceIsAllowedByActivity = (manualActivities?: GatewayActivity[]): [boolean, string?] => {
        const activities = manualActivities ?? this.lastActivities;
        if (activities.length !== 0) {
            const disallowedActivityType = activities.find(x => !this.config.activitiesOverrideAllow.includes(activityIdToStr(x.type)));
            if (disallowedActivityType !== undefined) {
                return [false, `a session has an activity type MS is not allowed to override: ${activityIdToStr(disallowedActivityType.type)}`];
            }
            const disallowedActivityName = activities.find(x => !this.config.applicationsOverrideDisallow.some(y => x.name.toLocaleLowerCase().includes(y.toLocaleLowerCase())));
            if (disallowedActivityType !== undefined) {
                return [false, `a session has an activity name MS is not allowed to override: ${disallowedActivityName.name}`];
            }
        }

        return [true];
    }

    presenceIsAllowed = (): [boolean, string?] => {
        const [statusAllowed, statusReason] = this.presenceIsAllowedByStatus();
        if(!statusAllowed) {
            return [statusAllowed, statusReason];
        }

        const [activityAllowed, activityReason] = this.presenceIsAllowedByActivity();
        if(!activityAllowed) {
            return [activityAllowed, activityReason];
        }

        return [true];
    }
}

const opcodeToFriendly = (op: number) => {
    switch (op) {
        case GatewayOpcodes.Hello:
            return 'Hello';
        case GatewayOpcodes.HeartbeatAck:
            return 'HeartbeatAck'
        case GatewayOpcodes.Heartbeat:
            return 'Heartbeat';
        case GatewayOpcodes.Dispatch:
            return 'Dispatch';
        case GatewayOpcodes.InvalidSession:
            return 'InvalidSession';
        case GatewayOpcodes.Reconnect:
            return 'Reconnect';
        case GatewayOpcodes.Resume:
            return 'Resume';
        case GatewayOpcodes.Identify:
            return 'Identify';
        case GatewayOpcodes.PresenceUpdate:
            return 'PresenceUpdate'
        default:
            return op;
    }
}

interface UserSession {
    status: 'online' | 'invisible' | 'dnd' | 'idle'
    client_info: {
        version: number
        os: string
        client: string
    }
    processed_at_timestamp?: number
    active?: boolean
    session_id: string
    // activities: {
    //     state: string
    //     created_at: number
    //     type: ActivityType
    //     name: string
    // }[]
    activities: GatewayActivity[]
}

export const playStateToActivityData = (data: SourceData, opts: { useArt?: boolean } = {}): { activity: GatewayActivity, artUrl?: string } => {
    // unix timestamps in milliseconds
    let startTime: number,
        endTime: number;

    let play: PlayObject;
    if (isPlayObject(data)) {
        play = data;
        if (data.meta.trackProgressPosition !== undefined && play.data.duration !== undefined) {
            startTime = dayjs().subtract(data.meta.trackProgressPosition, 's').unix() * 1000;
            endTime = dayjs().add(data.data.duration - data.meta.trackProgressPosition, 's').unix() * 1000;
        } else if (asPlayerStateData(data)) {
            play = data.play;
            if (data.position !== undefined && play.data.duration !== undefined) {
                startTime = dayjs().subtract(data.position, 's').unix() * 1000;
                endTime = dayjs().add(data.data.duration - data.position, 's').unix() * 1000;
            }
        }
    }

    let activityName = capitalize(play.meta?.musicService ?? play.meta?.mediaPlayerName ?? play.meta?.source ?? 'music')

    // @ts-expect-error
    const activity = removeUndefinedKeys<GatewayActivity>({
        // https://docs.discord.com/developers/events/gateway-events#activity-object
        type: 2, // Listening
        // https://docs.discord.com/developers/events/gateway-events#activity-object
        status_display_type: 1, // state
        name: activityName,
        details: play.data.track,
        state: play.data.artists !== undefined && play.data.artists.length > 0 ? play.data.artists.join(' / ') : undefined,
        // https://docs.discord.com/developers/events/gateway-events#activity-object-activity-assets
        // https://docs.discord.com/developers/events/gateway-events#activity-object-activity-asset-image
        assets: {
            large_text: play.data.album
        }
    });
    if (endTime !== undefined && startTime !== undefined) {
        activity.timestamps = {
            start: startTime,
            end: endTime
        }
    }
    
    //let buttons: GatewayActivityButton[] = [];

    const {
        meta: {
            url: {
                web,
                origin
            } = {},
        },
        data: {
            meta: {
                brainz: {
                    recording
                } = {}
            } = {}
        } = {}
    } = play;
    const url = origin ?? web;
    if(url !== undefined) {
        const knownService = urlToMusicService(url);
        if(knownService !== undefined) {
            activity.details_url = url;

            // when including buttons discord accepts the presence update but does not actually use it
            // I think buttons may now be limited to official RPC or restricted to preset actions via things like secrets or registering commands
            // https://docs.discord.com/developers/developer-tools/game-sdk#activitysecrets-struct

            // buttons.push({
            //     label: `Listen on ${capitalize(knownService)}`,
            //     url: web
            // });
        }
    }
    if(recording !== undefined) {
        const mb = `https://musicbrainz.org/recording/${recording}`;
        if(activity.details_url === undefined) {
            activity.details_url = mb;
        } else {
            activity.state_url = mb;
        }
        // buttons.push({
        //     label: 'Open on Musicbrainz',
        //     url: `https://musicbrainz.org/recording/${recording}`
        // });
    }
    // if(buttons.length > 0) {
    //     activity.buttons = buttons;
    // }

    const artUrl = play.meta?.art?.album ?? play.meta?.art?.track ?? play.meta?.art?.artist;

    return { activity, artUrl };
}

export const statusStringToType = (str: string): StatusType => {
    switch(str.trim().toLocaleLowerCase()) {
        case 'online':
            return PresenceUpdateStatus.Online;
        case 'idle':
            return PresenceUpdateStatus.Idle;
        case 'dnd':
            return PresenceUpdateStatus.DoNotDisturb;
        case 'invisible':
            return PresenceUpdateStatus.Invisible;
        default:
            throw new Error(`Not a valid status type. Must be one of: online | idle | dnd | invisible`);
    }
}

export const activityStringToType = (str: string): MSActivityType => {
    switch(str.trim().toLocaleLowerCase()) {
        case 'playing':
            return 'playing';
        case 'streaming':
            return 'streaming';
        case 'listening':
            return 'listening';
        case 'watching':
            return 'watching';
        case 'custom':
            return 'custom';
        case 'competing':
            return 'competing';
        default:
            throw new Error(`Not a valid activity type. Must be one of: playing | streaming | listening | watching | custom | competing`);
    }
}

export const activityIdToStr = (id: number): MSActivityType => {
    switch(id) {
        case 0:
            return 'playing';
        case 1:
            return 'streaming';
        case 2:
            return 'listening';
        case 3:
            return 'watching';
        case 4:
            return 'custom';
        case 5:
            return 'competing';
        default:
            throw new Error(`Not a valid activity type. Must be one of: playing | streaming | listening | watching | custom | competing`);
    }
}

export const configToStrong = (data: DiscordData): DiscordStrongData => {
            const {
            token,
            applicationId,
            artwork,
            artworkDefaultUrl,
            statusOverrideAllow = ['online','idle','dnd'],
            activitiesOverrideAllow = ['custom'],
            applicationsOverrideDisallow = []
        } = data;

        const strongConfig: DiscordStrongData = {
            token,
            applicationId,
            applicationsOverrideDisallow: parseArrayFromMaybeString(applicationsOverrideDisallow),
            artworkDefaultUrl
        }

        if (typeof artwork === 'boolean' || Array.isArray(artwork)) {
            strongConfig.artwork = artwork;
        } else if (typeof artwork === 'string') {
            if (['true', 'false'].includes(artwork.toLocaleLowerCase())) {
                strongConfig.artwork = parseBool(artwork)
            } else {
                strongConfig.artwork = parseArrayFromMaybeString(artwork)
            }
        }

        const saRaw = parseArrayFromMaybeString(statusOverrideAllow);
        strongConfig.statusOverrideAllow = saRaw.map(statusStringToType);

        const aaRaw = parseBoolOrArrayFromMaybeString(activitiesOverrideAllow);
        if(typeof aaRaw === 'boolean') {
            strongConfig.activitiesOverrideAllow = aaRaw ? ActivityTypes : [];
        } else {
            strongConfig.activitiesOverrideAllow = aaRaw.map(activityStringToType);
        }

        return strongConfig;
}