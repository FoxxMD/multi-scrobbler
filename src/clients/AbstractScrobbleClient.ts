import dayjs, {Dayjs} from "dayjs";
import {buildTrackString, capitalize, createLabelledLogger, playObjDataMatch} from "../utils.js";
import {ClientType, INITIALIZED, INITIALIZING, InitState, NOT_INITIALIZED} from "../common/infrastructure/Atomic.js";
import {Logger} from "winston";
import {CommonClientConfig} from "../common/infrastructure/config/client/index.js";
import {ClientConfig} from "../common/infrastructure/config/client/clients.js";

export default abstract class AbstractScrobbleClient {

    name: string;
    type: ClientType;

    #initState: InitState = NOT_INITIALIZED;

    requiresAuth: boolean = false;
    requiresAuthInteraction: boolean = false;
    authed: boolean = false;

    recentScrobbles = [];
    scrobbledPlayObjs = [];
    newestScrobbleTime?: Dayjs
    oldestScrobbleTime: Dayjs = dayjs();
    tracksScrobbled: number = 0;

    lastScrobbleCheck: Dayjs = dayjs();
    refreshEnabled: boolean;
    checkExistingScrobbles: boolean;
    verboseOptions;

    config: CommonClientConfig;
    logger: Logger;

    constructor(type: any, name: any, config: CommonClientConfig) {
        this.type = type;
        this.name = name;
        const identifier = `Client ${capitalize(this.type)} - ${name}`;
        this.logger = createLabelledLogger(identifier, identifier);

        const {
            // @ts-expect-error TS(2339): Property 'options' does not exist on type '{}'.
            options: {
                refreshEnabled = true,
                checkExistingScrobbles = true,
                verbose = {},
            } = {},
            ...rest
        } = config;
        this.config = rest;
        this.refreshEnabled = refreshEnabled;
        this.checkExistingScrobbles = checkExistingScrobbles;

        const {
            match: {
                onNoMatch = false,
                onMatch = false,
                confidenceBreakdown = false,
            } = {},
            ...vRest
        } = verbose
        if (onMatch || onNoMatch) {
            this.logger.warn('Setting verbose matching may produce noisy logs! Use with care.');
        }
        this.verboseOptions = {
            ...vRest,
            match: {
                onNoMatch,
                onMatch,
                confidenceBreakdown
            }
        };
    }

    get initialized() {
        return this.#initState === INITIALIZED;
    }

   set initialized(val) {
        // @ts-expect-error TS(2367): This condition will always return 'false' since th... Remove this comment to see the full error message
        if(val === INITIALIZING) {
            this.#initState = INITIALIZING;
        // @ts-expect-error TS(2367): This condition will always return 'false' since th... Remove this comment to see the full error message
        } else if(val === true || val === INITIALIZED) {
            this.#initState = INITIALIZED;
        } else {
            this.#initState = NOT_INITIALIZED;
        }
   }

   get initializing() {
        return this.#initState === INITIALIZING;
   }

    // default init function, should be overridden if init stage is required
    initialize = async () => {
        this.initialized = true;
        return true;
    }

    // default init function, should be overridden if auth stage is required
    testAuth = async () => {
        return this.authed;
    }

    isReady = async () => {
        return this.initialized && (!this.requiresAuth || (this.requiresAuth && this.authed));
    }

    refreshScrobbles = async () => {
        this.logger.debug('Scrobbler does not have refresh function implemented!');
    }

    alreadyScrobbled = async () => {
        this.logger.debug('Scrobbler does not have alreadyScrobbled check implemented!');
        return false;
    }

    scrobblesLastCheckedAt = () => {
        return this.lastScrobbleCheck;
    }

    formatPlayObj = (obj: any) => {
        this.logger.warn('formatPlayObj should be defined by concrete class!');
        return obj;
    }

    // time frame is valid as long as the play date for the source track is newer than the oldest play time from the scrobble client
    // ...this is assuming the scrobble client is returning "most recent" scrobbles
    timeFrameIsValid = (playObj: any, log = false) => {
        const {
            data: {
                // @ts-expect-error TS(2525): Initializer provides no value for this binding ele... Remove this comment to see the full error message
                playDate,
            } = {},
        } = playObj;
        const validTime = playDate.isAfter(this.oldestScrobbleTime);
        if (log && !validTime) {
            this.logger.debug(`${buildTrackString(playObj)} was in an invalid time frame (played before the oldest scrobble found)`);
        }
        return validTime;
    }

    addScrobbledTrack = (playObj: any, scrobbleResp: any) => {
        this.scrobbledPlayObjs.push({play: playObj, scrobble: this.formatPlayObj(scrobbleResp)});
    }

    cleanSourceSearchTitle = (playObj: any) => {
        const {
            data: {
                // @ts-expect-error TS(2525): Initializer provides no value for this binding ele... Remove this comment to see the full error message
                track,
            } = {},
        } = playObj;

        return track;
    };

    findExistingSubmittedPlayObj = (playObj: any) => {
        const {
            data: {
                // @ts-expect-error TS(2525): Initializer provides no value for this binding ele... Remove this comment to see the full error message
                playDate
            } = {},
            meta: {
                // @ts-expect-error TS(2525): Initializer provides no value for this binding ele... Remove this comment to see the full error message
                source,
            } = {}
        } = playObj;

        const dtInvariantMatches = this.scrobbledPlayObjs.filter(x => playObjDataMatch(playObj, x.play));

        if (dtInvariantMatches.length === 0) {
            return [undefined, undefined];
        }

        const matchPlayDate = dtInvariantMatches.find((x) => {
            const {
                play: {
                    data: {
                        // @ts-expect-error TS(2525): Initializer provides no value for this binding ele... Remove this comment to see the full error message
                        playDate: sPlayDate
                    } = {},
                    meta: {
                        // @ts-expect-error TS(2525): Initializer provides no value for this binding ele... Remove this comment to see the full error message
                        source: playSource
                    } = {},
                } = {},
            } = x;
            // need to account for inaccurate DT from subsonic
            if(source === 'Subsonic' && playSource === 'Subsonic') {
                return playDate.isSame(sPlayDate) || playDate.diff(sPlayDate, 'minute') <= 1;
            }
            return playDate.isSame(sPlayDate);
        });

        return [matchPlayDate, dtInvariantMatches];
    }
}
