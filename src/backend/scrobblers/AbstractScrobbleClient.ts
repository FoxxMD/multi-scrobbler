import { childLogger, Logger } from "@foxxmd/logging";
import dayjs, { Dayjs } from "dayjs";
import EventEmitter from "events";
import { FixedSizeList } from 'fixed-size-list';
import { nanoid } from "nanoid";
import { MarkOptional } from "ts-essentials";
import {
    DeadLetterScrobble,
    PlayObject,
    QueuedScrobble, TA_DURING,
    TA_FUZZY,
    TrackStringOptions
} from "../../core/Atomic.js";
import { buildTrackString, capitalize, truncateStringToLength } from "../../core/StringUtils.js";
import AbstractComponent from "../common/AbstractComponent.js";
import { UpstreamError } from "../common/errors/UpstreamError.js";
import {
    ARTIST_WEIGHT,
    Authenticatable,
    ClientType,
    DEFAULT_RETRY_MULTIPLIER,
    DUP_SCORE_THRESHOLD,
    FormatPlayObjectOptions,
    ScrobbledPlayObject,
    TIME_WEIGHT,
    TITLE_WEIGHT, TRANSFORM_HOOK,
} from "../common/infrastructure/Atomic.js";
import { CommonClientConfig, NowPlayingOptions, UpstreamRefreshOptions } from "../common/infrastructure/config/client/index.js";
import { Notifiers } from "../notifier/Notifiers.js";
import {
    comparingMultipleArtists,
    isDebugMode,
    playObjDataMatch,
    pollingBackoff,
    setIntersection,
    sleep,
    sortByOldestPlayDate,
} from "../utils.js";
import { messageWithCauses, messageWithCausesTruncatedDefault } from "../utils/ErrorUtils.js";
import { compareScrobbleArtists, compareScrobbleTracks, normalizeStr } from "../utils/StringUtils.js";
import {
    comparePlayTemporally,
    hasAcceptableTemporalAccuracy,
    temporalAccuracyToString,
    temporalPlayComparisonSummary,
} from "../utils/TimeUtils.js";
import { WebhookPayload } from "../common/infrastructure/config/health/webhooks.js";

export default abstract class AbstractScrobbleClient extends AbstractComponent implements Authenticatable {

    name: string;
    type: ClientType;

    protected MAX_STORED_SCROBBLES = 40;
    protected MAX_INITIAL_SCROBBLES_FETCH = this.MAX_STORED_SCROBBLES;

    #recentScrobblesList: PlayObject[] = [];
    scrobbledPlayObjs: FixedSizeList<ScrobbledPlayObject>;
    lastScrobbledPlayDate?: Dayjs;
    newestScrobbleTime?: Dayjs
    oldestScrobbleTime?: Dayjs
    tracksScrobbled: number = 0;

    lastScrobbleCheck: Dayjs = dayjs(0)
    lastScrobbleAttempt: Dayjs = dayjs(0)
    upstreamRefresh: MarkOptional<Required<UpstreamRefreshOptions>, 'refreshInitialCount'>;
    checkExistingScrobbles: boolean;
    verboseOptions;

    scrobbleDelay: number = 1000;
    scrobbleSleep: number = 2000;
    scrobbleRetries: number =  0;
    scrobbling: boolean = false;
    userScrobblingStopSignal: undefined | any;
    queuedScrobbles: QueuedScrobble<PlayObject>[] = [];
    deadLetterScrobbles: DeadLetterScrobble<PlayObject>[] = [];

    supportsNowPlaying: boolean = false;
    nowPlayingEnabled: boolean;
    // TODO refactor to use source name for filtering
    nowPlayingFilter: (data: PlayObject[]) => PlayObject[]
    nowPlayingThresholds: [number,number] = [10,30];
    nowPlayingLastUpdated?: Dayjs;
    nowPlayingLastPlay?: PlayObject;

    declare config: CommonClientConfig;

    notifier: Notifiers;
    emitter: EventEmitter;

    constructor(type: any, name: any, config: CommonClientConfig, notifier: Notifiers, emitter: EventEmitter, logger: Logger) {
        super(config);
        this.type = type;
        this.name = name;
        this.logger = childLogger(logger, this.getIdentifier());
        this.notifier = notifier;
        this.emitter = emitter;

        this.scrobbledPlayObjs = new FixedSizeList<ScrobbledPlayObject>(this.MAX_STORED_SCROBBLES);

        const {
            options: {
                refreshEnabled = true,
                refreshInitialCount,
                refreshMinInterval = 5,
                refreshStaleAfter = 60,
                checkExistingScrobbles = true,
                verbose = {},
            } = {},
        } = this.config
        this.upstreamRefresh = {
            refreshEnabled,
            refreshInitialCount,
            refreshMinInterval,
            refreshStaleAfter
        };
        if(refreshStaleAfter < (refreshMinInterval/1000)) {
            this.logger.warn(`refreshMinInterval (${refreshMinInterval}ms) is longer than refreshStaleAfter (${refreshStaleAfter}s)! This would cause refreshStaleAfter to potentially not trigger a refresh. Setting refreshMinInterval to same interval as refreshStaleAfter`);
            this.upstreamRefresh.refreshMinInterval = refreshStaleAfter * 1000;
        }
        this.checkExistingScrobbles = checkExistingScrobbles;

        const {
            match: {
                onNoMatch = isDebugMode(),
                onMatch = isDebugMode(),
                confidenceBreakdown = isDebugMode(),
            } = {},
            ...vRest
        } = verbose
        if (onMatch || onNoMatch || isDebugMode()) {
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

    set recentScrobbles(scrobbles: PlayObject[]) {
        const sorted = [...scrobbles];
        sorted.sort(sortByOldestPlayDate);
        this.#recentScrobblesList = sorted;
    }

    get recentScrobbles() {
        return this.#recentScrobblesList;
    }

    protected getIdentifier() {
        return `${capitalize(this.type)} - ${this.name}`
    }

    public notify = async (payload: WebhookPayload) => {
        this.emitEvent('notify', payload);
    }

    protected async postInitialize(): Promise<void> {
        const {
            options: {
                refreshInitialCount = this.MAX_INITIAL_SCROBBLES_FETCH
            } = {},
            options = {},
        } = this.config;

        let initialLimit = refreshInitialCount;
        if(refreshInitialCount > this.MAX_INITIAL_SCROBBLES_FETCH) {
            this.logger.warn(`Defined initial scrobbles count (${refreshInitialCount}) higher than maximum allowed (${this.MAX_INITIAL_SCROBBLES_FETCH}). Will use max instead.`);
            initialLimit = this.MAX_INITIAL_SCROBBLES_FETCH;
        }

        this.logger.verbose(`Fetching up to ${initialLimit} initial scrobbles...`);
        await this.refreshScrobbles(initialLimit);
        this.lastScrobbledPlayDate = this.newestScrobbleTime;
        
        if(this.supportsNowPlaying) {
            if(this.nowPlayingEnabled === undefined) {
                this.nowPlayingEnabled = true;
            }
            this.nowPlayingFilter = (data) => data.sort((a, b) => a.meta.source.localeCompare(b.meta.source));

            if('nowPlaying' in options) {
                const nowOpts = options as NowPlayingOptions;
                if(this.nowPlayingEnabled === undefined) {
                    this.nowPlayingEnabled = nowOpts.nowPlaying === true || Array.isArray(nowOpts.nowPlaying);
                }
                if(Array.isArray(nowOpts.nowPlaying)) {
                    this.nowPlayingFilter = (data) => {
                        for(const s of nowOpts.nowPlaying as string[]) {
                            const sLower = s.toLocaleLowerCase();
                            const validPlay = data.find(x => x.meta.source.toLocaleLowerCase() === sLower);
                            if(validPlay !== undefined) {
                                return undefined;
                            }
                        }
                        return [];
                    }
                }
            }
        }

    }

    refreshScrobbles = async (limit: number = this.MAX_STORED_SCROBBLES) => {
        if (this.upstreamRefresh.refreshEnabled) {
            this.logger.debug('Refreshing recent scrobbles');
            const recent = await this.getScrobblesForRefresh(limit);
            this.logger.debug(`Found ${recent.length} recent scrobbles`);
            this.recentScrobbles = recent;
            if (this.recentScrobbles.length > 0) {
                const [{data: {playDate: newestScrobbleTime = dayjs()} = {}} = {}] = this.recentScrobbles.slice(-1);
                const [{data: {playDate: oldestScrobbleTime = dayjs()} = {}} = {}] = this.recentScrobbles.slice(0, 1);
                this.newestScrobbleTime = newestScrobbleTime;
                this.oldestScrobbleTime = oldestScrobbleTime;

                this.filterScrobbledTracks();
            }
        }
        this.lastScrobbleCheck = dayjs();
    }

    protected abstract getScrobblesForRefresh(limit: number): Promise<PlayObject[]>;

    shouldRefreshScrobble = () => {
        const {
            refreshStaleAfter,
            refreshMinInterval,
            refreshEnabled
        } = this.upstreamRefresh;

        if (!refreshEnabled) {
            this.logger.debug({labels: ['Upstream Refresh']}, `Should NOT refresh => refreshEnabled is false`);
            return false;
        }

        if(this.queuedScrobbles.length === 0) {
            this.logger.debug({labels: ['Upstream Refresh']}, `Should NOT refresh => no scrobbles in queue!`);
            return false;
        }

        const queuedPlayedDate = this.getLatestQueuePlayDate();

        // if newest queued play was played more recently than the last time we refreshed upstream scrobbles
        if (this.scrobblesLastCheckedAt().unix() < queuedPlayedDate.unix()) {
            if(!this.scrobblesRefreshMinIntervalPassed()) {
                this.logger.debug({labels: ['Upstream Refresh']}, `Should refresh but WILL NOT => queued scrobble playDate is newer than last refresh but refreshMinInterval (${refreshMinInterval}ms) has not passed since last check`);
                return false;
            } else {
                this.logger.debug({labels: ['Upstream Refresh']}, 'Should refresh => newest queued scrobble playDate is newer than last refresh');
                return true;
            }
        }

        // if the play date of the last Play scrobbled is *newer*
        // than the queued scrobble we are about to scrobble
        // then we are inserting a scrobble out of order which can happen if
        // * backlogging and upstream returned plays out of order
        // * processing dead letter queue
        // * two sources have different history
        //
        // in all cases we probably want to refresh
        if(this.lastScrobbledPlayDate !== undefined && this.queuedScrobbles[0].play.meta.newFromSource && this.lastScrobbledPlayDate.unix() > this.queuedScrobbles[0].play.data.playDate.unix()) {
            if(!this.scrobblesRefreshMinIntervalPassed()) {
                this.logger.debug({labels: ['Upstream Refresh']}, `Should refresh but WILL NOT => queued scrobble playDate is older than last scrobbled play (out-of-order insert) but refreshMinInterval (${refreshMinInterval}ms) has not passed since last check`);
                return false;
            } else {
                this.logger.debug({labels: ['Upstream Refresh']}, 'Should refresh => queued scrobble playDate is older than last scrobbled play (out-of-order insert)');
                return true;
            }
        }

        // if it's been X seconds since we last refreshed
        if(refreshStaleAfter !== undefined) {
            const diff = dayjs().diff(this.scrobblesLastCheckedAt(), 's');
            if(diff > refreshStaleAfter) {
                this.logger.debug({labels: ['Upstream Refresh']}, `Should refresh => last refresh (${diff}s ago) was longer than refreshStaleAfter (${refreshStaleAfter}s)`);
                return true;
            }
        }

        return false;
    }

    protected scrobblesLastCheckedAt = () => this.lastScrobbleCheck
    protected scrobblesLastCheckedAtDiff = () => dayjs().diff(this.scrobblesLastCheckedAt(), 'ms')
    protected scrobblesRefreshMinIntervalPassed = () => {
        const {
            refreshMinInterval,
        } = this.upstreamRefresh;
        return this.scrobblesLastCheckedAtDiff() >= refreshMinInterval;
    }

    public abstract alreadyScrobbled(playObj: PlayObject, log?: boolean): Promise<boolean>;

    formatPlayObj = (obj: any, options: FormatPlayObjectOptions = {}) => {
        this.logger.warn('formatPlayObj should be defined by concrete class!');
        return obj;
    }

    // time frame is valid as long as the play date for the source track is newer than the oldest play time from the scrobble client
    // ...this is assuming the scrobble client is returning "most recent" scrobbles
    timeFrameIsValid = (playObj: PlayObject) => {

        if(this.oldestScrobbleTime === undefined) {
            return [true, ''];
        }

        const {
            data: {
                playDate,
            } = {},
        } = playObj;
        const validTime = playDate.isAfter(this.oldestScrobbleTime);
        let log = '';
        if (!validTime) {
            const dur = dayjs.duration(Math.abs(playDate.diff(this.oldestScrobbleTime))).humanize(false);
            log = `occurred ${dur} before the oldest scrobble returned by this client (${this.oldestScrobbleTime.format()})`;
        }
        return [validTime, log]
    }

    addScrobbledTrack = (playObj: PlayObject, scrobbledPlay: PlayObject) => {
        this.scrobbledPlayObjs.add({play: playObj, scrobble: scrobbledPlay});
        this.lastScrobbledPlayDate = playObj.data.playDate;
        this.tracksScrobbled++;
    }

    filterScrobbledTracks = () => {
        this.scrobbledPlayObjs = new FixedSizeList<ScrobbledPlayObject>(this.MAX_STORED_SCROBBLES, this.scrobbledPlayObjs.data.filter(x => this.timeFrameIsValid(x.play)[0])) ;
    }

    getScrobbledPlays = () => this.scrobbledPlayObjs.data.map(x => x.scrobble)

    findExistingSubmittedPlayObj = (playObjPre: PlayObject): ([undefined, undefined] | [ScrobbledPlayObject, ScrobbledPlayObject[]]) => {

        const playObj = this.transformPlay(playObjPre, TRANSFORM_HOOK.candidate);

        const dtInvariantMatches = this.scrobbledPlayObjs.data
            .map(x => ({...x, play: this.transformPlay(x.play, TRANSFORM_HOOK.existing)}))
            .filter(x => playObjDataMatch(playObj, x.play));

        if (dtInvariantMatches.length === 0) {
            return [undefined, []];
        }

        const matchPlayDate = dtInvariantMatches.find((x: ScrobbledPlayObject) => {
            const temporalComparison = comparePlayTemporally(x.play, playObj);
            return hasAcceptableTemporalAccuracy(temporalComparison.match)
        });

        return [matchPlayDate, dtInvariantMatches];
    }

    protected compareExistingScrobbleTitle = (existing: PlayObject, candidate: PlayObject): number => {
        const result = compareScrobbleTracks(existing, candidate);
        return Math.min(result.highScore/100, 1);
    }

    protected compareExistingScrobbleArtist = (existing: PlayObject, candidate: PlayObject): [number, number] => {
        const {
            data: {
                artists: existingArtists = [],
            } = {}
        } = existing;
        const {
            data: {
                artists: candidateArtists = [],
            } = {}
        } = candidate;
        const normExisting = existingArtists.map(x => normalizeStr(x, {keepSingleWhitespace: true}));
        const candidateExisting = candidateArtists.map(x => normalizeStr(x, {keepSingleWhitespace: true}));

        const wholeMatches = setIntersection(new Set(normExisting), new Set(candidateExisting)).size;
        return [Math.min(compareScrobbleArtists(existing, candidate)/100, 1), wholeMatches]
    }

    existingScrobble = async (playObjPre: PlayObject) => {

        const playObj = this.transformPlay(playObjPre, TRANSFORM_HOOK.candidate);

        const tr = truncateStringToLength(27);
        const scoreTrackOpts: TrackStringOptions = {include: ['track', 'artist', 'time'], transformers: {track: (t: any, data, existing) => `${existing ? '- ': ''}${tr(t)}`}};

        // return early if we don't care about checking existing
        if (false === this.checkExistingScrobbles) {
            if (this.verboseOptions.match.onNoMatch) {
                this.logger.debug(`${capitalize(playObj.meta.source ?? 'Source')}: ${buildTrackString(playObj, scoreTrackOpts)} => No Match because existing scrobble check is FALSE`, {leaf: ['Dupe Check']});
            }
            return undefined;
        }

        let existingScrobble;
        let closestMatch: {score: number, breakdowns: string[], confidence: string, scrobble?: PlayObject} = {score: 0, breakdowns: [], confidence: 'No existing scrobble matched with a score higher than 0'};

        // then check if we have already recorded this
        const [existingExactSubmitted, existingDataSubmitted = []] = this.findExistingSubmittedPlayObj(playObjPre);

        // if we have an submitted play with matching data and play date then we can just return the response from the original scrobble
        if (existingExactSubmitted !== undefined) {
            existingScrobble = existingExactSubmitted.scrobble;

            closestMatch = {
                score: 1,
                scrobble: existingScrobble,
                breakdowns: [],
                confidence: 'Exact Match found in previously successfully scrobbled plays'
            }
        }
        // if not though then we need to check recent scrobbles from scrobble api.
        // this will be less accurate than checking existing submitted (obv) but will happen if backlogging or on a fresh server start

        if (existingScrobble === undefined) {

            // if no recent scrobbles found then assume we haven't submitted it
            // (either user doesnt want to check history or there is no history to check!)
            if (this.recentScrobbles.length === 0) {
                if (this.verboseOptions.match.onNoMatch) {
                    this.logger.debug(`${buildTrackString(playObj, scoreTrackOpts)} => No Match because no recent scrobbles returned from API`, {leaf: ['Dupe Check']});
                }
                return undefined;
            }

            // we have found an existing submission but without an exact date
            // in which case we can check the scrobble api response against recent scrobbles (also from api) for a more accurate comparison
            const referenceApiScrobbleResponse = existingDataSubmitted.length > 0 ? existingDataSubmitted[0].scrobble : undefined;

            existingScrobble = this.recentScrobbles.find((xPre) => {

                const x = this.transformPlay(xPre, TRANSFORM_HOOK.existing);

                //const referenceMatch = referenceApiScrobbleResponse !== undefined && playObjDataMatch(x, referenceApiScrobbleResponse);


                const temporalComparison = comparePlayTemporally(x, playObj);
                let timeMatch = 0;
                if(hasAcceptableTemporalAccuracy(temporalComparison.match)) {
                    timeMatch = 1;
                } else if(hasAcceptableTemporalAccuracy(temporalComparison.match, [TA_FUZZY, TA_DURING])) {
                    timeMatch = 0.6;
                }

                const titleMatch = this.compareExistingScrobbleTitle(x, playObj);

                const [artistMatch, wholeMatches] = this.compareExistingScrobbleArtist(x, playObj);

                let artistScore = ARTIST_WEIGHT * artistMatch;
                const titleScore = TITLE_WEIGHT * titleMatch;
                const timeScore = TIME_WEIGHT * timeMatch;
                //const referenceScore = REFERENCE_WEIGHT * (referenceMatch ? 1 : 0);
                let score = artistScore + titleScore + timeScore;

                let artistWholeMatchBonus = 0;
                let artistBreakdown =  `Artist: ${artistMatch.toFixed(2)} * ${ARTIST_WEIGHT} = ${artistScore.toFixed(2)}`;

                if(score < 1 && timeMatch > 0 && titleMatch > 0.98 && artistMatch > 0.1 && wholeMatches > 0 && comparingMultipleArtists(x, playObj)) {
                    // address scenario where:
                    // * title is very close
                    // * time falls within plausible dup range
                    // * artist is not totally different
                    // * AND score is still not high enough for a dup
                    //
                    // if we detect the plays have multiple artists and we have at least one whole match (stricter comparison than regular score)
                    // then bump artist score a little to see if it gets it over the fence
                    //
                    // EX: Source: The Bongo Hop - Sonora @ 2023-09-28T10:54:06-04:00 => Closest Scrobble: Nidia Gongora / The Bongo Hop - Sonora @ 2023-09-28T10:59:34-04:00 => Score 0.83 => No Match
                    // one play is only returning primary artist, and timestamp is at beginning instead of end of play

                    const scoreBonus = artistMatch * 0.5;
                    const scoreGapBonus = (1 - artistMatch) * 0.75;
                    // use the smallest bump or 0.1
                    artistWholeMatchBonus = Math.max(scoreBonus, scoreGapBonus, 0.1);
                    artistScore = (ARTIST_WEIGHT + 0.05) * (artistMatch + artistWholeMatchBonus);
                    score = artistScore + titleScore + timeScore;
                    artistBreakdown = `Artist: (${artistMatch.toFixed(2)} + Whole Match Bonus ${artistWholeMatchBonus.toFixed(2)}) * (${ARTIST_WEIGHT} + Whole Match Bonus 0.05) = ${artistScore.toFixed(2)}`;
                }

                const scoreBreakdowns = [
                    //`Reference: ${(referenceMatch ? 1 : 0)} * ${REFERENCE_WEIGHT} = ${referenceScore.toFixed(2)}`,
                    artistBreakdown,
                    `Title: ${titleMatch.toFixed(2)} * ${TITLE_WEIGHT} = ${titleScore.toFixed(2)}`,
                    `Time: (${capitalize(temporalAccuracyToString(temporalComparison.match))}) ${timeMatch} * ${TIME_WEIGHT} = ${timeScore.toFixed(2)}`,
                    `Time Detail => ${temporalPlayComparisonSummary(temporalComparison, x, playObj)}`,
                    `Score ${score.toFixed(2)} => ${score >= DUP_SCORE_THRESHOLD ? 'Matched!' : 'No Match'}`
                ];

                const confidence = `Score ${score.toFixed(2)} => ${score >= DUP_SCORE_THRESHOLD ? 'Matched!' : 'No Match'}`

                const scoreInfo = {
                    score,
                    scrobble: x,
                    confidence,
                    breakdowns: scoreBreakdowns
                }

                if (closestMatch.score <= score && score > 0) {
                    closestMatch = scoreInfo
                }

                return score >= DUP_SCORE_THRESHOLD;
            });
        }

        if ((existingScrobble !== undefined && this.verboseOptions.match.onMatch) || (existingScrobble === undefined && this.verboseOptions.match.onNoMatch)) {
            const closestScrobbleParts: string[] = [];
            if(closestMatch.scrobble !== undefined) {
                closestScrobbleParts.push(`Closest Scrobble: ${buildTrackString(closestMatch.scrobble, scoreTrackOpts)}`);
            }
            closestScrobbleParts.push(closestMatch.confidence);
            this.logger.debug(`${capitalize(playObj.meta.source ?? 'Source')}: ${buildTrackString(playObj, scoreTrackOpts)} => ${closestScrobbleParts.join(' => ')}`, {leaf: ['Dupe Check']});
            if (this.verboseOptions.match.confidenceBreakdown === true && closestMatch.breakdowns.length > 0) {
                this.logger.debug(`Breakdown:
${closestMatch.breakdowns.join('\n')}`, {leaf: ['Dupe Check']});
            }
        }
        return existingScrobble;
    }

    public scrobble = async (playObj: PlayObject, opts?: { delay?: number | false }): Promise<PlayObject> => {
        const {delay} = opts || {};
        const scrobbleDelay = delay === undefined ? this.scrobbleDelay : (delay === false ? 0 : delay);
        if (scrobbleDelay !== 0) {
            const lastScrobbleDiff = dayjs().diff(this.lastScrobbleAttempt, 'ms');
            const remainingDelay = scrobbleDelay - lastScrobbleDiff;
            if (remainingDelay > 0) {
                this.logger.debug(`Waiting ${remainingDelay}ms to scrobble so time passed since previous scrobble is at least ${scrobbleDelay}ms`);
                await sleep(scrobbleDelay);
            }
        }
        try {
            return this.doScrobble(playObj);
        } finally {
            this.lastScrobbleAttempt = dayjs();
        }
    }

    protected abstract doScrobble(playObj: PlayObject): Promise<PlayObject>

    public abstract playToClientPayload(playObject: PlayObject): object

    initScrobbleMonitoring = async (options: {force?: boolean, notify?: boolean} = {}) => {
        const {force = false, notify = false} = options;

        if(!this.isReady() || force) {
            try {
                await this.tryInitialize(options);
            } catch (e) {
                this.logger.error(new Error('Cannot start monitoring because Client is not ready', {cause: e}));
                if(notify) {
                    await this.notify( {title: `${this.getIdentifier()} - Processing Error`, message: `Cannot start monitoring because Client is not ready: ${truncateStringToLength(500)(messageWithCausesTruncatedDefault(e))}`, priority: 'error'});
                }
                return;
            }
        }

        this.startScrobbling().catch((e) => {
            // do nothing, should have already been caught and logged
        });
        return;
    }

    startScrobbling = async () => {
        // reset poll attempts if already previously run
        this.scrobbleRetries = 0;

        const {
            data: {
                maxPollRetries = 5,
                retryMultiplier = DEFAULT_RETRY_MULTIPLIER,
            } = {},
        } = this.config;

        // can't have negative retries!
        const maxRetries = Math.max(0, maxPollRetries);

        if(this.scrobbling === true) {
            this.logger.warn(`Already scrobble processing! Processing needs to be stopped before it can be started`);
            return;
        }

        let pollRes: boolean | undefined = undefined;
        while (pollRes === undefined && this.scrobbleRetries <= maxRetries) {
            try {
                pollRes = await this.doProcessing();
                if(pollRes === true) {
                    break;
                }
            } catch (e) {
                if(!this.isUsable()) {
                    this.logger.warn('Stopping scrobble processing due to client no longer usable.');
                    await this.notify({title: `${this.getIdentifier()} - Processing Error`, message: `Encountered error while scrobble processing and client is no longer usable, stopping processing!. | Error: ${e.message}`, priority: 'error'});
                    break;
                } else if (this.authGated()) {
                    this.logger.warn('Stopping scrobble processing due to client no longer being authenticated.');
                    await this.notify({title: `${this.getIdentifier()} - Processing Error`, message: `Encountered error while scrobble processing and client is no longer authenticated, stopping processing!. | Error: ${e.message}`, priority: 'error'});
                    break;
                } else if (this.scrobbleRetries < maxRetries) {
                    const delayFor = pollingBackoff(this.scrobbleRetries + 1, retryMultiplier);
                    this.logger.info(`Scrobble processing retries (${this.scrobbleRetries}) less than max processing retries (${maxRetries}), restarting processing after ${delayFor} second delay...`);
                    await this.notify({title: `${this.getIdentifier()} - Processing Retry`, message: `Encountered error while polling but retries (${this.scrobbleRetries}) are less than max poll retries (${maxRetries}), restarting processing after ${delayFor} second delay. | Error: ${e.message}`, priority: 'warn'});
                    await sleep((delayFor) * 1000);
                } else {
                    this.logger.warn(`Scrobble processing retries (${this.scrobbleRetries}) equal to max processing retries (${maxRetries}), stopping processing!`);
                    await this.notify({title: `${this.getIdentifier()} - Processing Error`, message: `Encountered error while scrobble processing and retries (${this.scrobbleRetries}) are equal to max processing retries (${maxRetries}), stopping processing!. | Error: ${e.message}`, priority: 'error'});
                }
                this.scrobbleRetries++;
            }
        }
    }

    tryStopScrobbling = async () => {
        if(this.scrobbling === false) {
            this.logger.warn(`Polling is already stopped!`);
            return;
        }
        this.userScrobblingStopSignal = true;
        let secsPassed = 0;
        while(this.userScrobblingStopSignal !== undefined && secsPassed < 10) {
            await sleep(2000);
            secsPassed += 2;
            this.logger.verbose(`Waiting for scrobble processing stop signal to be acknowledged (waited ${secsPassed}s)`);
        }
        if(this.userScrobblingStopSignal !== undefined) {
            this.logger.warn('Could not stop scrobble processing! Or signal was lost :(');
            return false;
        }
        return true;
    }

    protected doStopScrobbling = (reason: string = 'system') => {
        this.scrobbling = false;
        this.userScrobblingStopSignal = undefined;
        this.emitEvent('statusChange', {status: 'Idle'});
        this.logger.info(`Stopped scrobble processing due to: ${reason}`);
    }

    protected shouldStopScrobbleProcessing = () => this.scrobbling === false || this.userScrobblingStopSignal !== undefined;

    protected doProcessing = async (): Promise<true | undefined> => {
        if (this.scrobbling === true) {
            return true;
        }
        this.logger.info('Scrobble processing started');
        this.emitEvent('statusChange', {status: 'Running'});

        try {
            this.scrobbling = true;
            while (!this.shouldStopScrobbleProcessing()) {
                while (this.queuedScrobbles.length > 0) {
                    if (this.shouldRefreshScrobble()) {
                        await this.refreshScrobbles();
                    }
                    const currQueuedPlay = this.queuedScrobbles.shift();
                    const [timeFrameValid, timeFrameValidLog] = this.timeFrameIsValid(currQueuedPlay.play);
                    if (timeFrameValid && !(await this.alreadyScrobbled(currQueuedPlay.play))) {
                        const transformedScrobble = this.transformPlay(currQueuedPlay.play, TRANSFORM_HOOK.postCompare);
                        try {
                            const scrobbledPlay = await this.scrobble(transformedScrobble);
                            this.emitEvent('scrobble', {play: transformedScrobble});
                            this.addScrobbledTrack(transformedScrobble, scrobbledPlay);
                        } catch (e) {
                            if (e instanceof UpstreamError && e.showStopper === false) {
                                this.addDeadLetterScrobble(currQueuedPlay, e);
                                this.logger.warn(new Error(`Could not scrobble ${buildTrackString(transformedScrobble)} from Source '${currQueuedPlay.source}' but error was not show stopping. Adding scrobble to Dead Letter Queue and will retry on next heartbeat.`, {cause: e}));
                            } else {
                                this.queuedScrobbles.unshift(currQueuedPlay);
                                throw new Error('Error occurred while trying to scrobble', {cause: e});
                            }
                        }
                    } else if (!timeFrameValid) {
                        this.logger.debug(`Will not scrobble ${buildTrackString(currQueuedPlay.play)} from Source '${currQueuedPlay.source}' because it ${timeFrameValidLog}`);
                    }
                    this.emitEvent('scrobbleDequeued', {queuedScrobble: currQueuedPlay})
                }
                await sleep(this.scrobbleSleep);
            }
            if (this.shouldStopScrobbleProcessing()) {
                this.doStopScrobbling(this.userScrobblingStopSignal !== undefined ? 'user input' : undefined);
                return true;
            }
        } catch (e) {
            this.logger.error('Scrobble processing interrupted');
            this.logger.error(e);
            this.emitEvent('statusChange', {status: 'Idle'});
            this.scrobbling = false;
            throw e;
        }
    }

    processDeadLetterQueue = async (attemptWithRetries?: number) => {

        if (this.deadLetterScrobbles.length === 0) {
            return;
        }

        const {
            options: {
                deadLetterRetries = 1
            } = {}
        } = this.config;

        const retries = attemptWithRetries ?? deadLetterRetries;

        const processable = this.deadLetterScrobbles.filter(x => x.retries < retries);
        const queueStatus = `${processable.length} of ${this.deadLetterScrobbles.length} dead scrobbles have less than ${retries} retries, ${processable.length === 0 ? 'will skip processing.': 'processing now...'}`;
        if (processable.length === 0) {
            this.logger.verbose(queueStatus, {leaf: 'Dead Letter'});
            return;
        }
        this.logger.info(queueStatus, {leaf: 'Dead Letter'});

        const removedIds = [];
        for (const deadScrobble of this.deadLetterScrobbles) {
            if (deadScrobble.retries < retries) {
                const [scrobbled, dead] = await this.processDeadLetterScrobble(deadScrobble.id);
                if (scrobbled) {
                    removedIds.push(deadScrobble.id);
                }
            }
        }
        if (removedIds.length > 0) {
            this.logger.info(`Removed ${removedIds.length} scrobbles from dead letter queue`, {leaf: 'Dead Letter'});
        }
    }

    processDeadLetterScrobble = async (id: string): Promise<[boolean, DeadLetterScrobble<PlayObject>?]> => {
        const deadScrobbleIndex = this.deadLetterScrobbles.findIndex(x => x.id === id);
        const deadScrobble = this.deadLetterScrobbles[deadScrobbleIndex];

        if (!(await this.isReady())) {
            this.logger.warn('Cannot process dead letter scrobble because client is not ready.', {leaf: 'Dead Letter'});
            return [false, deadScrobble];
        }
        if (this.getLatestQueuePlayDate() !== undefined && this.scrobblesLastCheckedAt().unix() < this.getLatestQueuePlayDate().unix()) {
            await this.refreshScrobbles();
        }
        const [timeFrameValid, timeFrameValidLog] = this.timeFrameIsValid(deadScrobble.play);
        if (timeFrameValid && !(await this.alreadyScrobbled(deadScrobble.play))) {
            const transformedScrobble = this.transformPlay(deadScrobble.play, TRANSFORM_HOOK.postCompare);
            try {
                const scrobbledPlay = await this.scrobble(transformedScrobble);
                this.emitEvent('scrobble', {play: transformedScrobble});
                this.addScrobbledTrack(transformedScrobble, scrobbledPlay);
            } catch (e) {
                deadScrobble.retries++;
                deadScrobble.error = messageWithCauses(e);
                deadScrobble.lastRetry = dayjs();
                this.logger.error(new Error(`Could not scrobble ${buildTrackString(transformedScrobble)} from Source '${deadScrobble.source}' due to error`, {cause: e}));
                this.deadLetterScrobbles[deadScrobbleIndex] = deadScrobble;
                return [false, deadScrobble];
            } finally {
                await sleep(1000);
            }
        } else if (!timeFrameValid) {
            this.logger.debug(`Will not scrobble ${buildTrackString(deadScrobble.play)} from Source '${deadScrobble.source}' because it ${timeFrameValidLog}`, {leaf: 'Dead Letter'});
        }
        if(deadScrobble !== undefined) {
            this.removeDeadLetterScrobble(deadScrobble.id)
        }

        return [true];
    }

    removeDeadLetterScrobble = (id: string) => {
        const index = this.deadLetterScrobbles.findIndex(x => x.id === id);
        if (index === -1) {
            this.logger.warn(`No scrobble found with ID ${id}`, {leaf: 'Dead Letter'});
        }
        this.logger.info(`Removed scrobble ${buildTrackString(this.deadLetterScrobbles[index].play)} from queue`, {leaf: 'Dead Letter'});
        this.deadLetterScrobbles.splice(index, 1);
    }

    removeDeadLetterScrobbles = () => {
        this.deadLetterScrobbles = [];
        this.logger.info('Removed all scrobbles from queue', {leaf: 'Dead Letter'});
    }

    protected getLatestQueuePlayDate = () => {
        if (this.queuedScrobbles.length === 0) {
            return undefined;
        }
        return this.queuedScrobbles[this.queuedScrobbles.length - 1].play.data.playDate;
    }

    queueScrobble = (data: PlayObject | PlayObject[], source: string) => {
        const plays = Array.isArray(data) ? data : [data];
        for(const p of plays) {
            const transformedPlay = this.transformPlay(p, TRANSFORM_HOOK.preCompare);
            const queuedPlay = {id: nanoid(), source, play: transformedPlay}
            this.emitEvent('scrobbleQueued', {queuedPlay: queuedPlay});
            this.queuedScrobbles.push(queuedPlay);
        }
        this.queuedScrobbles.sort((a, b) => sortByOldestPlayDate(a.play, b.play));
    }

    protected addDeadLetterScrobble = (data: QueuedScrobble<PlayObject>, error: (Error | string) = 'Unspecified error') => {
        let eString = '';
        if(typeof error === 'string') {
            eString = error;
        } else {
            eString = messageWithCauses(error);
        }
        const deadData = {id: nanoid(), retries: 0, error: eString, ...data};
        this.deadLetterScrobbles.push(deadData);
        this.deadLetterScrobbles.sort((a, b) => sortByOldestPlayDate(a.play, b.play));
        this.emitEvent('deadLetter', {dead: deadData});
    }

    playingNow = (data: PlayObject | PlayObject[], source: string) => {
        const plays = Array.isArray(data) ? data : [data];
        const p = plays.at(-1);
        
        if(p !== undefined) {
            const transformedPlay = this.transformPlay(p, TRANSFORM_HOOK.preCompare);
            if(this.shouldUpdatePlayingNow(p)) {
            this.doPlayingNow(transformedPlay);
            this.logger.debug(`Now Playing updated.`);
            this.nowPlayingLastPlay = transformedPlay;
            this.nowPlayingLastUpdated = dayjs();
            }
        }
    }

    protected shouldUpdatePlayingNow = (data: PlayObject): boolean => {
        if(this.nowPlayingLastPlay === undefined || this.nowPlayingLastUpdated === undefined) {
            this.logger.debug(`Now Playing has not yet been set! Should update Now Playing`);
            return true;
        }

        const lastUpdateDiff = Math.abs(dayjs().diff(this.nowPlayingLastUpdated, 's'));

        // update if play *has* changed and time since last update is greater than min interval
        // this prevents spamming scrobbler API with updates if user is skipping tracks and source updates frequently
        if(!playObjDataMatch(data, this.nowPlayingLastPlay) && this.nowPlayingThresholds[0] < lastUpdateDiff) {
            this.logger.debug(`New Play differs from previous Now Playing and time since update > ${lastUpdateDiff}s, should update Now Playing`);
            return true;
        }
        // update if play *has not* changed but last update is greater than max interval
        // this keeps scrobbler Now Playing fresh ("active" indicator) in the event play is long
        if(playObjDataMatch(data, this.nowPlayingLastPlay) && this.nowPlayingThresholds[1] < lastUpdateDiff) {
            this.logger.debug(`Now Playing has not been updated in > ${lastUpdateDiff}s, should update Now Playing`);
            return true;
        }

        return false;
    }

    protected doPlayingNow = (data: PlayObject): Promise<any> => Promise.resolve(undefined)


    public emitEvent = (eventName: string, payload: object) => {
        this.emitter.emit(eventName, {
            data: payload,
            type: this.type,
            name: this.name,
            from: 'client'
        });
    }
}
