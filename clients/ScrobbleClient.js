export default class ScrobbleClient {

    name;

    recentScrobbles = [];

    lastScrobbleCheck = new Date();

    config;
    logger;

    constructor(logger, config = {}) {
        this.logger = logger;
        this.config = config;
    }

    scrobblesLastCheckedAt = () => {
        return this.lastScrobbleCheck;
    }
}
