import { childLogger, Logger } from "@foxxmd/logging";
import { WS } from 'iso-websocket'
import { DiscordStrongData, StatusType, DiscordWSData, ActivityData, ACTIVITY_TYPE } from "../../infrastructure/config/client/discord.js";
import { _DataPayload, _NonDispatchPayload, APIUser, GatewayActivity, GatewayActivityAssets, GatewayCloseCodes, GatewayDispatchEvents, GatewayHeartbeatRequest, GatewayHelloData, GatewayIdentify, GatewayInvalidSessionData, GatewayOpcodes, GatewayPresenceUpdateData, GatewayReadyDispatchData, GatewayResumeData, GatewayUpdatePresence, PresenceUpdateStatus } from "discord.js";
import { isDebugMode, removeUndefinedKeys, sleep } from "../../../utils.js";
import pEvent from 'p-event';
import EventEmitter from "events";
import { randomInt } from "crypto";
import request from 'superagent';
import { AbstractApiOptions,SourceData } from "../../infrastructure/Atomic.js";
import { isPlayObject } from "../../../../core/Atomic.js";
import dayjs, { Dayjs } from "dayjs";
import { getRoot } from "../../../ioc.js";
import { formatWebsocketClose, isCloseEvent, isErrorEvent, wsReadyStateToStr } from "../../../utils/NetworkUtils.js";
import { activityIdToStr, opcodeToFriendly, playStateToActivityData } from "./DiscordUtils.js";
import { DiscordAbstractClient } from "./DiscordAbstractClient.js";

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
export class DiscordWSClient extends DiscordAbstractClient {

    declare config: DiscordWSData;

    heartbeatInterval: number
    // used for debugging/troubleshooting weird interval speed up
    // can remove once this bug is for sure squashed
    lastHeartbeatIntervalSentAt?: Dayjs;
    heartbeatTimeout?: NodeJS.Timeout;
    acknowledged: boolean = true;

    // https://docs.discord.com/developers/events/gateway#ready-event
    // used for resuming session, if possible
    session_id: string;
    resume_gateway_url: string;
    sequence: number;

    initialGatewayUrl?: string;

    gatewayMsgLogger: Logger;

    user: APIUser;

    declare client: WS;

    canResume?: boolean = false;
    ready: boolean = false;
    authOK?: boolean
    reconnecting?: boolean = false;

    lastActiveStatus?: PresenceUpdateStatus = PresenceUpdateStatus.Offline;
    lastActivities: GatewayActivity[] = [];

    activityTimeout?: NodeJS.Timeout;
    clearLastActivitiesTimeout?: NodeJS.Timeout;

    get friendlySocketState() { return `Socket state: ${wsReadyStateToStr(this.client.readyState)}`}

    constructor(name: any, config: DiscordStrongData, options: AbstractApiOptions) {
        if(config.token === undefined) {
            throw new Error('token must be defined');
        }
        super('WS', name, config as DiscordWSData, options);
        //const gatewaySeq =  `Gateway${this.sequence !== undefined ? ` Seq ${this.sequence}` : ''}`;
        this.logger = childLogger(options.logger, [() => this.gatewaySeqLabel()]);
        this.gatewayMsgLogger = childLogger(this.logger, 'Received Message');
        this.emitter = new EventEmitter();
        this.cache = getRoot().items.cache();
        this.covertArtApi = getRoot().items.coverArtApi;
    }

    protected gatewaySeqLabel() {
        return `Gateway${this.sequence !== undefined ? ` Seq ${this.sequence}` : ''}`;
    }

    initClient = async () => {

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
                    this.cleanupConnection();

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
                this.cleanupConnection();
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
            this.cleanupConnection();
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
            this.sendResume();
        } else {
            // initial identify
            this.sendIdentify();
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

    sendIdentify() {
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
        this.gatewayMsgLogger.debug(`Hello! Heartbeat Interval is ${data.heartbeat_interval}ms`);
        this.heartbeatInterval = data.heartbeat_interval - 500;
        this.lastHeartbeatIntervalSentAt = undefined;
        const sleepTime = this.heartbeatInterval * (randomInt(100) / 100);

        this.logger.debug(`Waiting ${Math.floor(sleepTime / 1000)}s before sending first heartbeat.`);
        await sleep(sleepTime);
        const sent = this.sendHeartbeat();
        if(sent) {
            this.createHeartbeatInterval();
        }
    }

    doHeartbeatInteval() {

        if (this.heartbeatTimeout !== undefined) {
            clearTimeout(this.heartbeatTimeout);
            this.heartbeatTimeout = undefined;
        }

        if(!this.acknowledged) {
            this.logger.warn('Did not recieve Heartbeat ACK! May be a zombie so trying to reconnect.');
            return this.handleReconnect().then(() => null).catch((e) => this.logger.error(e));
        } else {
            if(this.lastHeartbeatIntervalSentAt !== undefined) {
                const diff = dayjs().diff(this.lastHeartbeatIntervalSentAt, 'ms');
                if(diff < this.heartbeatInterval && this.heartbeatInterval - diff > 2000) {
                    this.logger.warn(`Time since last heartbeat interval sent is ${this.heartbeatInterval - diff}ms shorter than interval (${this.heartbeatInterval})`)
                }
            }
            const sent = this.sendHeartbeat(true);
            this.acknowledged = false;
            if(sent) {
                this.lastHeartbeatIntervalSentAt = dayjs();
                this.createHeartbeatInterval();
            }
        }
    }

    createHeartbeatInterval() {
        if (this.heartbeatTimeout !== undefined) {
            clearTimeout(this.heartbeatTimeout);
            this.heartbeatTimeout = undefined;
        }

        if(this.heartbeatInterval !== undefined) {
            this.heartbeatTimeout = setTimeout(() => {
                this.doHeartbeatInteval();
            }, this.heartbeatInterval);
        } else {
            this.logger.warn('Cannot create heartbeat timeout because no interval is set.');
        }
    }

    sendHeartbeat(includeInterval: boolean = false): boolean {
        if (this.client.readyState !== this.client.OPEN) {
            this.logger.warn(`Cannot send heartbeat because connection is not open`);
            return false;
        }
        const heartbeatRequest: GatewayHeartbeatRequest = {
            op: GatewayOpcodes.Heartbeat,
            // @ts-expect-error
            d: this.sequence ?? null
        }

        if (isDebugMode()) {
            this.logger.debug(`Sending heartbeat${includeInterval ? `, interval is ${this.heartbeatInterval}ms` : ''}`);
        }
        this.client.send(JSON.stringify(heartbeatRequest));
        return true;
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
        this.gatewayMsgLogger.verbose(` Connection READY for ${this.user.username} | Session ${this.session_id}`);
        this.cancelClearLastActivities();
        this.emitter.emit('ready', {ready: true});
    }

    handleResume() {
        this.gatewayMsgLogger.verbose(`Connection RESUMED | Session ${this.session_id}`);
        this.canResume = true;
        this.ready = true;
        this.authOK = true;
        this.reconnecting = false;
        this.cancelClearLastActivities();
        this.emitter.emit('ready', {ready: true});
        // extra careful to make sure we restart heartbeat in the event a heartbeat tried to run
        // while client was reconnecting and not open
        if(this.heartbeatTimeout === undefined) {
            this.createHeartbeatInterval();
        }
    }

    /** https://docs.discord.com/developers/events/gateway-events#invalid-session */
    handleInvalidSession(data: GatewayInvalidSessionData) {
        this.canResume = data !== false;
        return this.handleReconnect().then(() => null).catch((e) => this.logger.error(e));
    }

    async handleReconnect() {
        this.logger.verbose('Starting reconnect attempt');
        // on a manual close ws-isosocket does not retry
        // so we need to do it manually
        this.client.close();

        // closing manually also does not trigger a 'close' event so we need to check readyState
        const now = dayjs();
        let elapsed = 0; 
        if(this.client.readyState !== this.client.CLOSED) {
            this.logger.debug(`${this.friendlySocketState}, waiting for it to be closed...`);
            while(this.client.readyState !== this.client.CLOSED && elapsed < 10000) {
                elapsed = Math.abs(dayjs().diff(now, 'ms'));
                this.logger.debug(`Elapsed ${elapsed}ms | ${this.friendlySocketState}`);
                await sleep(1000);
            }
        }

        if(this.client.readyState !== this.client.CLOSED && this.client.readyState !== this.client.CONNECTING) {
            throw new Error('Waited too long for socket to close');
        }
        this.logger.debug('Socket closed, reconnecting');
        this.cleanupConnection();
        try {
            await this.tryAuthenticate();
        } catch (e) {
            throw new Error('Could not manually reconnect', {cause: e});
        }
    }

    sendResume() {
        const data: GatewayResumeData = {
            token: this.config.token,
            session_id: this.session_id,
            seq: this.sequence
        }

        if(this.client.OPEN !== this.client.readyState) {
            this.logger.warn(`Cannot send resume because connection is not open`);
            return;
        } else if(isDebugMode()) {
            this.logger.verbose(`Sending resume | Session ${this.session_id}`);
        }
        this.client.send(JSON.stringify({ op: GatewayOpcodes.Resume, d: data }));
    }

    clearLastActivities(now: boolean = false) {
        this.cancelClearLastActivities();
        if(!now) {
            // clear activities if takes longer than 5 seconds to get READY
            //
            // allows us to reasonably assume activities have not changed during a clean reconnect that did not take very long 
            // so that we don't need to wait for another SESSION_REPLACE and can immediately update now playing
            //
            // but if user has to restart later, or something else goes wrong, we are sure we have reset activities when next READY
            this.logger.debug('Delaying last activities clear for 5 seconds...');
            this.clearLastActivitiesTimeout = setTimeout(() => {
                this.logger.debug('Clearing last activities');
                this.lastActiveStatus = PresenceUpdateStatus.Offline;
                this.lastActivities = [];
                this.clearLastActivitiesTimeout = undefined;
            }, 5000);
        } else {
            this.logger.debug('Clearing last activities');
            this.lastActiveStatus = PresenceUpdateStatus.Offline;
            this.lastActivities = [];
        }
    }

    cancelClearLastActivities() {
        if(this.clearLastActivitiesTimeout !== undefined) {
            this.logger.debug('Cancelling clear activities timeout');
            clearTimeout(this.clearLastActivitiesTimeout);
            this.clearLastActivitiesTimeout = undefined;
        }
    }

    cleanupConnection() {
        if(this.heartbeatTimeout !== undefined) {
            clearInterval(this.heartbeatTimeout);
            this.heartbeatTimeout = undefined;
        }
        if(this.activityTimeout !== undefined) {
            clearTimeout(this.activityTimeout);
            this.activityTimeout = undefined;
        }
        this.ready = false;
        if (!this.canResume) {
            this.logger.verbose('Cannot resume session, clearing session data for clean reconnect');
            this.session_id = undefined;
            this.sequence = undefined;
            this.resume_gateway_url = undefined;
            this.user = undefined;
            this.heartbeatInterval = undefined;
            this.acknowledged = false;
            this.clearLastActivities();
        }
    }

    handleUserSessionUpdates = (data: UserSession[]) => {
        if (data.filter(x => x.session_id !== this.session_id && x.session_id !== 'all').length === 0) {
            this.gatewayMsgLogger.debug(`Updated user sessions => No other user sessions exist, marking our session presence as inactive`);
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
        this.gatewayMsgLogger.debug(`Updated user sessions\n${sessionSummaries.join('\n')}`);

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
                this.sendClearActivity();
            }
        }
    }

    async handleMessage(message: _DataPayload<GatewayDispatchEvents> | _NonDispatchPayload) {
        const { op, s } = message;
        if (s !== null && s !== undefined) {
            this.sequence = s;
        }
        try {

            switch (op) {
                case GatewayOpcodes.Hello:
                    this.handleHello(message.d as GatewayHelloData).catch(e => this.logger.error(e));
                    break;
                case GatewayOpcodes.HeartbeatAck:
                    if (isDebugMode()) {
                        this.gatewayMsgLogger.debug(`Heartbeat ACK`);
                    }
                    this.acknowledged = true;
                    break;
                case GatewayOpcodes.Heartbeat:
                    if (isDebugMode()) {
                        this.gatewayMsgLogger.debug(`Heartbeat REQ`);
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
                        case GatewayDispatchEvents.Resumed:
                            this.handleResume();
                            break;
                        default:
                            if (isDebugMode()) {
                                this.gatewayMsgLogger.debug(`Dispatch Event ${message.t}`);
                            }
                    };
                    break;
                case GatewayOpcodes.InvalidSession:
                    this.gatewayMsgLogger.verbose(`Invalid session opcode`);
                    this.handleInvalidSession(message.d as GatewayInvalidSessionData);
                    break;
                case GatewayOpcodes.Reconnect:
                    this.gatewayMsgLogger.verbose(`Reconnect opcode`);
                    await this.handleReconnect();
                    break;
                case GatewayOpcodes.Identify:
                    this.gatewayMsgLogger.debug({ data: message.d }, `Identify opcode`);
                    break;
                case GatewayOpcodes.PresenceUpdate:
                    this.gatewayMsgLogger.debug({ data: message.d }, `Presence Update opcode`);
                    break;
                default:
                    this.gatewayMsgLogger.debug(`opcode: ${op}`);
                    break;
            }
        } catch (error) {
            const friendlyOp = opcodeToFriendly(op);
            let handleHint = `opcode ${op}${friendlyOp !== op ? ` (${friendlyOp})` : ''}`;
            if (op === GatewayOpcodes.Dispatch) {
                handleHint += ` w/ Dispatch Event ${message.t}`;
            }
            throw new Error(`Error handling gateway message for ${handleHint} (Seq ${this.sequence})`, { cause: error });
        }
    }

    playStateToActivity = async (data: SourceData): Promise<GatewayActivity> => {
        const {activity: msActivity, artUrl} = playStateToActivityData(data);
        const assets = await this.getArtAsset(data, artUrl);
        if(assets !== undefined) {
            const {
                assets: msAssets = {}
            } = msActivity;
            msActivity.assets = {
                ...msAssets,
                ...assets
            }
        } else if(Object.keys(msActivity.assets ?? {}).length === 1 && msActivity.assets.largeText !== undefined) {
            // this means we can't set any artwork, likely because there is no applicationId. So delete all assets to ensure activity is accepted
            delete msActivity.assets;
        }
        const activity = activityDataToGatewayActivity(msActivity);
        return activity;
    }

    sendActivity = async (data: SourceData | undefined) => {
        if(data === undefined) {
            this.sendClearActivity();
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
            this.sendClearActivity();
        }, Math.abs(clearTime.diff(dayjs(), 'ms')));
    }

    sendClearActivity = () => {
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

    checkOkToSend = (): [boolean, string?, string?] => {
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

    presenceIsAllowedByStatus = (status?: PresenceUpdateStatus | StatusType): [boolean, string?] => {
        if (!this.config.statusOverrideAllow.includes(status as StatusType ?? this.lastActiveStatus as StatusType)) {
            return [false, `most active session has a disallowed status: ${status ?? this.lastActiveStatus}`];
        }
        return [true];
    }

    presenceIsAllowedByActivity = (manualActivities?: GatewayActivity[]): [boolean, string?] => {
        const activities = manualActivities ?? this.lastActivities;
        const listeningActivities = activities.filter(x => x.type === ACTIVITY_TYPE.Listening);
        if (listeningActivities.length !== 0) {
            const disallowedActivityName = activities.find(x => !this.config.listeningActivityAllow.some(y => x.name.toLocaleLowerCase().includes(y.toLocaleLowerCase())));
            if (disallowedActivityName !== undefined) {
                return [false, `a session has a listening activity MS is not allowed to broadcast at the same time as: ${disallowedActivityName.name}`];
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
    activities: GatewayActivity[]
}

export const activityDataToGatewayActivity = (data: ActivityData): GatewayActivity => {
    const {
        statusDisplayType,
        activityType,
        detailsUrl,
        stateUrl,
        createdAt,
        assets: {
            largeImage,
            largeText,
            largeUrl,
            smallImage,
            smallText,
            smallUrl,
        } = {},
        ...rest
    } = data;

    const assets = removeUndefinedKeys<GatewayActivityAssets>({
        large_image: largeImage,
        large_text: largeText,
        large_url: largeUrl,
        small_image: smallImage,
        small_text: smallText,
        small_url: smallUrl
    });

    const activity: Omit<GatewayActivity, 'id'> = removeUndefinedKeys<Omit<GatewayActivity, 'id'>>({
        status_display_type: statusDisplayType,
        type: activityType,
        details_url: detailsUrl,
        state_url: stateUrl,
        created_at: createdAt,
        assets,
        ...rest,
    }
    );
    return activity as GatewayActivity;
}