import dayjs from "dayjs";

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

    constructor(logger, config = {}, options = {}) {
        this.logger = logger;
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

    inValidTimeframe = (playDate) => {
        const newest = this.newestScrobbleTime ?? dayjs();
        return playDate.isBetween(this.oldestScrobbleTime, newest);
    }
}
