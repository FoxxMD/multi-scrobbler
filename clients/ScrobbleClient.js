export default class ScrobbleClient {

    name;

    recentScrobbles = [];

    lastScrobbleCheck = new Date();

    config;

    constructor(config = {}) {
        this.config = config;
    }

    scrobblesLastCheckedAt = () => {
        return this.lastScrobbleCheck;
    }
}
