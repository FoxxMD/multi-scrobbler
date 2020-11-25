import dayjs from "dayjs";
import {buildTrackString, createLabelledLogger} from "../utils.js";

export default class AbstractScrobbleClient {

    name;

    recentScrobbles = [];
    newestScrobbleTime;
    oldestScrobbleTime = dayjs();

    lastScrobbleCheck = dayjs();
    refreshEnabled;
    checkExistingScrobbles;

    config;
    logger;

    constructor(config = {}, options = {}) {
        this.logger = createLabelledLogger('default', 'App');
        this.config = config;
        const {
            refreshEnabled = true,
            checkExistingScrobbles = true,
        } = options;
        this.refreshEnabled = refreshEnabled;
        this.checkExistingScrobbles = checkExistingScrobbles;
    }

    scrobblesLastCheckedAt = () => {
        return this.lastScrobbleCheck;
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
}
