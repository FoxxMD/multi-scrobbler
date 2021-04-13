import dayjs from "dayjs";
import {buildTrackString, capitalize, createLabelledLogger, playObjDataMatch} from "../utils.js";

export default class AbstractScrobbleClient {

    name;
    type;
    initialized = false;

    recentScrobbles = [];
    scrobbledPlayObjs = [];
    newestScrobbleTime;
    oldestScrobbleTime = dayjs();
    tracksScrobbled = 0;

    lastScrobbleCheck = dayjs();
    refreshEnabled;
    checkExistingScrobbles;
    verboseOptions;

    config;
    logger;

    constructor(type, name, config = {}) {
        this.type = type;
        this.name = name;
        const identifier = `Client ${capitalize(this.type)} - ${name}`;
        this.logger = createLabelledLogger(identifier, identifier);

        const {
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

    scrobblesLastCheckedAt = () => {
        return this.lastScrobbleCheck;
    }

    formatPlayObj = obj => {
        this.logger.warn('formatPlayObj should be defined by concrete class!');
        return obj;
    }

    // time frame is valid as long as the play date for the source track is newer than the oldest play time from the scrobble client
    // ...this is assuming the scrobble client is returning "most recent" scrobbles
    timeFrameIsValid = (playObj, log = false) => {
        const {
            data: {
                playDate,
            } = {},
        } = playObj;
        const validTime = playDate.isAfter(this.oldestScrobbleTime);
        if (log && !validTime) {
            this.logger.debug(`${buildTrackString(playObj)} was in an invalid time frame (played before the oldest scrobble found)`);
        }
        return validTime;
    }

    addScrobbledTrack = (playObj, scrobbleResp) => {
        this.scrobbledPlayObjs.push({play: playObj, scrobble: this.formatPlayObj(scrobbleResp)});
    }

    cleanSourceSearchTitle = (playObj) => {
        const {
            data: {
                track,
            } = {},
        } = playObj;

        return track;
    };

    findExistingSubmittedPlayObj = (playObj) => {
        const {
            data: {
                playDate
            } = {},
            meta: {
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
                        playDate: sPlayDate
                    } = {},
                    meta: {
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
